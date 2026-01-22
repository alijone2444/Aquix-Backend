const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { authenticate } = require('../middleware/auth');
const { authorize, requireRole } = require('../middleware/authorize');
const { sendOTPEmail } = require('../services/emailService');

const router = express.Router();

/**
 * POST /api/auth/signup
 * Register a new user
 * Body: { fullName, email, password, company, userType }
 */
router.post('/signup', async (req, res) => {
  try {
    const { fullName, email, password, company, userType } = req.body;

    // Validate required fields
    if (!fullName || !email || !password) {
      return res.status(400).json({ 
        error: 'fullName, email, and password are required' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'Password must be at least 6 characters long' 
      });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Create user with is_active = false (will be activated after OTP verification)
      const userResult = await pool.query(
        `INSERT INTO users (full_name, email, password_hash, company, is_active)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, full_name, email, company, is_active, created_at`,
        [fullName, email, passwordHash, company || null, false]
      );

      const user = userResult.rows[0];

      // Assign role based on userType (default to 'seller' if not provided)
      let roleToAssign = userType || 'seller';
      
      // Validate role exists
      const roleResult = await pool.query(
        'SELECT id FROM roles WHERE name = $1',
        [roleToAssign]
      );

      if (roleResult.rows.length === 0) {
        // If role doesn't exist, default to seller
        const defaultRoleResult = await pool.query(
          'SELECT id FROM roles WHERE name = $1',
          ['seller']
        );
        
        if (defaultRoleResult.rows.length === 0) {
          throw new Error('Default seller role not found. Please run seed data.');
        }
        
        roleToAssign = 'seller';
        await pool.query(
          'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
          [user.id, defaultRoleResult.rows[0].id]
        );
      } else {
        // Assign the requested role
        await pool.query(
          'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
          [user.id, roleResult.rows[0].id]
        );
      }

      // Generate 6-digit OTP
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

      // Save OTP to database
      await pool.query(
        `INSERT INTO otps (user_id, email, otp_code, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [user.id, email, otpCode, expiresAt]
      );

      // Send OTP email
      try {
        await sendOTPEmail(email, otpCode, fullName);
      } catch (emailError) {
        console.error('Error sending OTP email:', emailError);
        // Don't fail signup if email fails, but log it
        // In production, you might want to handle this differently
      }

      await pool.query('COMMIT');

      res.status(201).json({
        message: 'User created successfully. Please check your email for OTP verification.',
        user: {
          id: user.id,
          fullName: user.full_name,
          email: user.email,
          company: user.company,
          userType: roleToAssign,
          isActive: false
        },
        requiresVerification: true
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/verify-otp
 * Verify OTP and activate user account
 * Body: { email, otp }
 */
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ 
        error: 'Email and OTP are required' 
      });
    }

    // Find the most recent unverified OTP for this email
    const otpResult = await pool.query(
      `SELECT o.*, u.id as user_id, u.full_name, u.is_active
       FROM otps o
       JOIN users u ON o.user_id = u.id
       WHERE o.email = $1 
         AND o.is_verified = false
         AND o.expires_at > NOW()
       ORDER BY o.created_at DESC
       LIMIT 1`,
      [email]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid or expired OTP. Please request a new one.' 
      });
    }

    const otpRecord = otpResult.rows[0];

    // Verify OTP code
    if (otpRecord.otp_code !== otp) {
      return res.status(400).json({ error: 'Invalid OTP code' });
    }

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Mark OTP as verified
      await pool.query(
        `UPDATE otps 
         SET is_verified = true, verified_at = NOW()
         WHERE id = $1`,
        [otpRecord.id]
      );

      // Activate user account
      await pool.query(
        `UPDATE users 
         SET is_active = true 
         WHERE id = $1`,
        [otpRecord.user_id]
      );

      await pool.query('COMMIT');

      // Get user with roles and permissions for token
      const userResult = await pool.query(
        `SELECT 
          u.id, u.full_name, u.email, u.company, u.is_active,
          COALESCE(
            json_agg(DISTINCT jsonb_build_object(
              'id', r.id,
              'name', r.name,
              'description', r.description
            )) FILTER (WHERE r.id IS NOT NULL),
            '[]'
          ) as roles,
          COALESCE(
            json_agg(DISTINCT jsonb_build_object(
              'id', p.id,
              'name', p.name,
              'resource', p.resource,
              'action', p.action
            )) FILTER (WHERE p.id IS NOT NULL),
            '[]'
          ) as permissions
        FROM users u
        LEFT JOIN user_roles ur ON u.id = ur.user_id
        LEFT JOIN roles r ON ur.role_id = r.id
        LEFT JOIN role_permissions rp ON r.id = rp.role_id
        LEFT JOIN permissions p ON rp.permission_id = p.id
        WHERE u.id = $1
        GROUP BY u.id, u.full_name, u.email, u.company, u.is_active`,
        [otpRecord.user_id]
      );

      const user = userResult.rows[0];

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET || 'your-secret-key-change-in-production',
        { expiresIn: '7d' }
      );

      res.json({
        message: 'Email verified successfully. Account activated.',
        user: {
          id: user.id,
          fullName: user.full_name,
          email: user.email,
          company: user.company,
          isActive: user.is_active,
          roles: user.roles || [],
          permissions: user.permissions || []
        },
        token
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/resend-otp
 * Resend OTP to user's email
 * Body: { email }
 */
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if user exists and is not already active
    const userResult = await pool.query(
      'SELECT id, full_name, email, is_active FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    if (user.is_active) {
      return res.status(400).json({ 
        error: 'Account is already verified and active' 
      });
    }

    // Generate new 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Invalidate old OTPs (optional - you can keep them or delete)
    // For now, we'll just create a new one

    // Save new OTP to database
    await pool.query(
      `INSERT INTO otps (user_id, email, otp_code, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [user.id, email, otpCode, expiresAt]
    );

    // Send OTP email
    try {
      await sendOTPEmail(email, otpCode, user.full_name);
      res.json({
        message: 'OTP has been resent to your email. Please check your inbox.'
      });
    } catch (emailError) {
      console.error('Error sending OTP email:', emailError);
      res.status(500).json({ 
        error: 'Failed to send OTP email. Please try again later.' 
      });
    }
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/login
 * Login user
 * Body: { email, password }
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required' 
      });
    }

    // Get user with roles and permissions
    const userResult = await pool.query(
      `SELECT 
        u.id, u.full_name, u.email, u.password_hash, u.company, u.is_active,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'id', r.id,
            'name', r.name,
            'description', r.description
          )) FILTER (WHERE r.id IS NOT NULL),
          '[]'
        ) as roles,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'resource', p.resource,
            'action', p.action
          )) FILTER (WHERE p.id IS NOT NULL),
          '[]'
        ) as permissions
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      LEFT JOIN role_permissions rp ON r.id = rp.role_id
      LEFT JOIN permissions p ON rp.permission_id = p.id
      WHERE u.email = $1
      GROUP BY u.id, u.full_name, u.email, u.password_hash, u.company, u.is_active`,
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ 
        error: 'Account not verified', 
        message: 'Please verify your email with OTP before logging in.',
        requiresVerification: true
      });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        company: user.company,
        roles: user.roles || [],
        permissions: user.permissions || []
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/auth/me
 * Get current user info (requires authentication)
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    res.json({
      user: req.user
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/assign-role
 * Assign a role to a user (requires superadmin or admin with permission)
 * Body: { userId, roleId }
 */
router.post('/assign-role', 
  authenticate, 
  requireRole(['superadmin', 'admin']),
  authorize('assign-role', 'user'),
  async (req, res) => {
    try {
      const { userId, roleId } = req.body;

      if (!userId || !roleId) {
        return res.status(400).json({ 
          error: 'userId and roleId are required' 
        });
      }

      // Check if role exists
      const roleResult = await pool.query(
        'SELECT id, name FROM roles WHERE id = $1',
        [roleId]
      );

      if (roleResult.rows.length === 0) {
        return res.status(404).json({ error: 'Role not found' });
      }

      // Check if user exists
      const userResult = await pool.query(
        'SELECT id FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Assign role (ON CONFLICT handles duplicate assignments)
      await pool.query(
        `INSERT INTO user_roles (user_id, role_id, assigned_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [userId, roleId, req.user.id]
      );

      res.json({ 
        message: 'Role assigned successfully',
        role: roleResult.rows[0].name
      });
    } catch (error) {
      console.error('Assign role error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

module.exports = router;

