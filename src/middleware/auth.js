const jwt = require('jsonwebtoken');
const pool = require('../db');

/**
 * JWT Authentication Middleware
 * Verifies JWT token and attaches user info to req.user
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');

    // Get user from database with roles and permissions
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
      WHERE u.id = $1 AND u.is_active = true
      GROUP BY u.id, u.full_name, u.email, u.company, u.is_active`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    const user = userResult.rows[0];
    
    // Attach user to request
    req.user = {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      company: user.company,
      roles: user.roles || [],
      permissions: user.permissions || []
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
};

/**
 * Profile Verification Middleware
 * Ensures that investors have verified institutional profiles
 * and sellers have verified company profiles before accessing protected routes
 * 
 * Usage: Add after authenticate middleware
 * router.get('/dashboard', authenticate, requireProfileVerification, handler);
 */
const requireProfileVerification = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRoles = req.user.roles.map(role => role.name);

    // Check seller profile verification
    if (userRoles.includes('seller')) {
      const companyProfile = await pool.query(
        'SELECT id, is_verified FROM company_profiles WHERE user_id = $1',
        [req.user.id]
      );

      if (companyProfile.rows.length === 0) {
        return res.status(403).json({ 
          error: 'Profile incomplete', 
          message: 'Please complete your company profile before accessing the seller dashboard.',
          requiresProfile: true,
          profileType: 'company'
        });
      }

      if (!companyProfile.rows[0].is_verified) {
        return res.status(403).json({ 
          error: 'Profile not verified', 
          message: 'Your company profile must be verified by an administrator before you can access the seller dashboard.',
          requiresVerification: true,
          profileType: 'company'
        });
      }
    }

    // Check investor profile verification
    if (userRoles.includes('investor')) {
      const institutionalProfile = await pool.query(
        'SELECT id, is_verified FROM institutional_profiles WHERE user_id = $1',
        [req.user.id]
      );

      if (institutionalProfile.rows.length === 0) {
        return res.status(403).json({ 
          error: 'Profile incomplete', 
          message: 'Please complete your institutional profile before accessing the investor dashboard.',
          requiresProfile: true,
          profileType: 'institutional'
        });
      }

      if (!institutionalProfile.rows[0].is_verified) {
        return res.status(403).json({ 
          error: 'Profile not verified', 
          message: 'Your institutional profile must be verified by an administrator before you can access the investor dashboard.',
          requiresVerification: true,
          profileType: 'institutional'
        });
      }
    }

    // Admins and superadmins bypass profile verification
    next();
  } catch (error) {
    console.error('Profile verification middleware error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  authenticate,
  requireProfileVerification
};

