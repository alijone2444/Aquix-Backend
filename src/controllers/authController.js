const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { sendOTPEmail } = require('../services/emailService');

/**
 * Signup - Register a new user
 */
const signup = async (req, res) => {
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

    // Check if user already exists and their status
    const existingUser = await pool.query(
      'SELECT id, is_active FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];
      
      // If user exists but is inactive, resend OTP and allow them to proceed to verification
      if (user.is_active === false) {
        // Generate new 6-digit OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

        // Get user details for email
        const userDetails = await pool.query(
          'SELECT full_name, email FROM users WHERE id = $1',
          [user.id]
        );

        const fullName = userDetails.rows[0]?.full_name || 'User';

        // Save new OTP to database
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
          // Continue even if email fails
        }

        return res.status(200).json({
          success: true,
          message: 'User already exists. A new OTP has been sent to your email. Please verify to continue.',
          user: {
            email: email,
            isActive: false
          },
          requiresVerification: true
        });
      }
      
      // If user exists and is active, return error
      return res.status(400).json({ 
        error: 'Email already registered and verified. Please login instead.' 
      });
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
      }

      await pool.query('COMMIT');

      res.status(201).json({
        success: true,
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
};

/**
 * Verify OTP - Verify OTP and activate user account
 */
const verifyOtp = async (req, res) => {
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
};

/**
 * Resend OTP - Resend OTP to user's email
 */
const resendOtp = async (req, res) => {
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
};

/**
 * Login - Login user
 */
const login = async (req, res) => {
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

    // Get user roles as array of names for easier frontend use
    const userRoles = (user.roles || []).map(role => role.name);
    const primaryRole = userRoles[0] || null;

    // Check profile completion status based on role
    let profileStatus = {
      hasCompanyProfile: false,
      hasInvestorProfile: false,
      hasInstitutionalProfile: false,
      companyProfileVerified: false,
      investorProfileVerified: false,
      institutionalProfileVerified: false
    };

    // Check company profile (for seller role) - REQUIRED FOR LOGIN
    if (userRoles.includes('seller')) {
      const companyProfile = await pool.query(
        'SELECT id, is_verified FROM company_profiles WHERE user_id = $1',
        [user.id]
      );
      if (companyProfile.rows.length > 0) {
        profileStatus.hasCompanyProfile = true;
        profileStatus.companyProfileVerified = companyProfile.rows[0].is_verified;
        
        // Block login if company profile is not verified
        if (!companyProfile.rows[0].is_verified) {
          return res.status(403).json({ 
            error: 'Profile not verified', 
            message: 'Your company profile must be verified by an administrator before you can access the seller dashboard.',
            requiresVerification: true,
            profileType: 'company'
          });
        }
      } else {
        // Block login if seller doesn't have a company profile
        return res.status(403).json({ 
          error: 'Profile incomplete', 
          message: 'Please complete your company profile before logging in.',
          requiresProfile: true,
          profileType: 'company'
        });
      }
    }

    // Check institutional profile (for investor role) - REQUIRED FOR LOGIN
    if (userRoles.includes('investor')) {
      // Check institutional profile first (required for investors)
      const institutionalProfile = await pool.query(
        'SELECT id, is_verified FROM institutional_profiles WHERE user_id = $1',
        [user.id]
      );
      if (institutionalProfile.rows.length > 0) {
        profileStatus.hasInstitutionalProfile = true;
        profileStatus.institutionalProfileVerified = institutionalProfile.rows[0].is_verified;
        
        // Block login if institutional profile is not verified
        if (!institutionalProfile.rows[0].is_verified) {
          return res.status(403).json({ 
            error: 'Profile not verified', 
            message: 'Your institutional profile must be verified by an administrator before you can access the investor dashboard.',
            requiresVerification: true,
            profileType: 'institutional'
          });
        }
      } else {
        // Block login if investor doesn't have an institutional profile
        return res.status(403).json({ 
          error: 'Profile incomplete', 
          message: 'Please complete your institutional profile before logging in.',
          requiresProfile: true,
          profileType: 'institutional'
        });
      }

      // Check investor profile (optional, but track if exists)
      const investorProfile = await pool.query(
        'SELECT id, is_verified FROM investor_profiles WHERE user_id = $1',
        [user.id]
      );
      if (investorProfile.rows.length > 0) {
        profileStatus.hasInvestorProfile = true;
        profileStatus.investorProfileVerified = investorProfile.rows[0].is_verified;
      }
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        company: user.company,
        isActive: user.is_active,
        roles: user.roles || [],
        roleNames: userRoles,
        primaryRole: primaryRole,
        permissions: user.permissions || []
      },
      profileStatus: profileStatus
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get Me - Get current user info
 */
const getMe = async (req, res) => {
  try {
    res.json({
      user: req.user
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Assign Role - Assign a role to a user
 */
const assignRole = async (req, res) => {
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
};

/**
 * Create or Update Company Profile
 */
const createCompanyProfile = async (req, res) => {
  try {
    const {
      // Personal & Contact Information (Step 1)
      fullName,
      position,
      founderManagingDirector,
      businessEmail,
      companyName,
      country,
      phone,
      city,
      
      // Company Information (Step 2)
      yearFounded,
      legalForm,
      industrySector,
      numberOfEmployees,
      
      // Financial Overview (Step 3)
      annualRevenue,
      ebit,
      currentYearEstimate,
      currency,
      customerConcentrationPercent,
      growthTrend,
      
      // Ownership & Readiness (Step 4)
      ownershipStructure,
      founderSharesPercent,
      successionPlanned,
      currentAdvisors,
      interestedInSale,
      
      // Compliance & Consent (Step 5)
      dataUploadUrl,
      ndaConsent,
      gdprConsent
    } = req.body;

    // Validate required fields
    if (!companyName) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    // Check if profile already exists for this user
    const existingProfile = await pool.query(
      'SELECT id FROM company_profiles WHERE user_id = $1',
      [req.user.id]
    );

    if (existingProfile.rows.length > 0) {
      // Update existing profile
      const profileId = existingProfile.rows[0].id;
      
      const updateResult = await pool.query(
        `UPDATE company_profiles SET
          full_name = $1, position = $2, founder_managing_director = $3,
          business_email = $4, company_name = $5, country = $6, phone = $7, city = $8,
          year_founded = $9, legal_form = $10, industry_sector = $11, number_of_employees = $12,
          annual_revenue = $13, ebit = $14, current_year_estimate = $15, currency = $16,
          customer_concentration_percent = $17, growth_trend = $18,
          ownership_structure = $19, founder_shares_percent = $20, succession_planned = $21,
          current_advisors = $22, interested_in_sale = $23,
          data_upload_url = $24, nda_consent = $25, gdpr_consent = $26,
          is_verified = false, verified_by = NULL, verified_at = NULL
        WHERE id = $27
        RETURNING *`,
        [
          fullName || null,
          position || null,
          founderManagingDirector || null,
          businessEmail || null,
          companyName,
          country || null,
          phone || null,
          city || null,
          yearFounded || null,
          legalForm || null,
          industrySector || null,
          numberOfEmployees || null,
          annualRevenue || null,
          ebit || null,
          currentYearEstimate || null,
          currency || 'USD',
          customerConcentrationPercent || null,
          growthTrend || null,
          ownershipStructure || null,
          founderSharesPercent || null,
          successionPlanned || null,
          currentAdvisors || null,
          interestedInSale || null,
          dataUploadUrl || null,
          ndaConsent || false,
          gdprConsent || false,
          profileId
        ]
      );

      return res.json({
        message: 'Company profile updated successfully',
        profile: updateResult.rows[0],
        isVerified: false
      });
    } else {
      // Create new profile
      const insertResult = await pool.query(
        `INSERT INTO company_profiles (
          user_id, full_name, position, founder_managing_director,
          business_email, company_name, country, phone, city,
          year_founded, legal_form, industry_sector, number_of_employees,
          annual_revenue, ebit, current_year_estimate, currency,
          customer_concentration_percent, growth_trend,
          ownership_structure, founder_shares_percent, succession_planned,
          current_advisors, interested_in_sale,
          data_upload_url, nda_consent, gdpr_consent, is_verified
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
          $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
          $25, $26, $27, $28
        ) RETURNING *`,
        [
          req.user.id,
          fullName || null,
          position || null,
          founderManagingDirector || null,
          businessEmail || null,
          companyName,
          country || null,
          phone || null,
          city || null,
          yearFounded || null,
          legalForm || null,
          industrySector || null,
          numberOfEmployees || null,
          annualRevenue || null,
          ebit || null,
          currentYearEstimate || null,
          currency || 'USD',
          customerConcentrationPercent || null,
          growthTrend || null,
          ownershipStructure || null,
          founderSharesPercent || null,
          successionPlanned || null,
          currentAdvisors || null,
          interestedInSale || null,
          dataUploadUrl || null,
          ndaConsent || false,
          gdprConsent || false,
          false // is_verified defaults to false
        ]
      );

      return res.status(201).json({
        message: 'Company profile created successfully. Awaiting verification.',
        profile: insertResult.rows[0],
        isVerified: false
      });
    }
  } catch (error) {
    console.error('Company profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get Company Profile
 */
const getCompanyProfile = async (req, res) => {
  try {
    const profileResult = await pool.query(
      'SELECT * FROM company_profiles WHERE user_id = $1',
      [req.user.id]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Company profile not found' });
    }

    res.json({
      profile: profileResult.rows[0]
    });
  } catch (error) {
    console.error('Get company profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Verify Company Profile
 */
const verifyCompanyProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { verified } = req.body;

    if (typeof verified !== 'boolean') {
      return res.status(400).json({ error: 'verified field must be a boolean' });
    }

    const updateResult = await pool.query(
      `UPDATE company_profiles 
       SET is_verified = $1, 
           verified_by = $2,
           verified_at = CASE WHEN $1 = true THEN NOW() ELSE NULL END
       WHERE id = $3
       RETURNING *`,
      [verified, req.user.id, id]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Company profile not found' });
    }

    res.json({
      message: verified ? 'Company profile verified successfully' : 'Company profile verification removed',
      profile: updateResult.rows[0]
    });
  } catch (error) {
    console.error('Verify company profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Create or Update Investor Profile
 */
const createInvestorProfile = async (req, res) => {
  try {
    const {
      fullName,
      firmSize,
      primaryMarkets,
      investmentFocus,
      contactNumber
    } = req.body;

    // Validate required fields
    if (!fullName) {
      return res.status(400).json({ error: 'Full name is required' });
    }

    // Check if profile already exists for this user
    const existingProfile = await pool.query(
      'SELECT id FROM investor_profiles WHERE user_id = $1',
      [req.user.id]
    );

    if (existingProfile.rows.length > 0) {
      // Update existing profile
      const profileId = existingProfile.rows[0].id;
      
      const updateResult = await pool.query(
        `UPDATE investor_profiles SET
          full_name = $1,
          firm_size = $2,
          primary_markets = $3,
          investment_focus = $4,
          contact_number = $5,
          is_verified = false,
          verified_by = NULL,
          verified_at = NULL
        WHERE id = $6
        RETURNING *`,
        [
          fullName,
          firmSize || null,
          primaryMarkets || null,
          investmentFocus || null,
          contactNumber || null,
          profileId
        ]
      );

      return res.json({
        message: 'Investor profile updated successfully',
        profile: updateResult.rows[0],
        isVerified: false
      });
    } else {
      // Create new profile
      const insertResult = await pool.query(
        `INSERT INTO investor_profiles (
          user_id, full_name, firm_size, primary_markets,
          investment_focus, contact_number, is_verified
        ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          req.user.id,
          fullName,
          firmSize || null,
          primaryMarkets || null,
          investmentFocus || null,
          contactNumber || null,
          false // is_verified defaults to false
        ]
      );

      return res.status(201).json({
        message: 'Investor profile created successfully. Awaiting verification.',
        profile: insertResult.rows[0],
        isVerified: false
      });
    }
  } catch (error) {
    console.error('Investor profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get Investor Profile
 */
const getInvestorProfile = async (req, res) => {
  try {
    const profileResult = await pool.query(
      'SELECT * FROM investor_profiles WHERE user_id = $1',
      [req.user.id]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Investor profile not found' });
    }

    res.json({
      profile: profileResult.rows[0]
    });
  } catch (error) {
    console.error('Get investor profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Verify Investor Profile
 */
const verifyInvestorProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { verified } = req.body;

    if (typeof verified !== 'boolean') {
      return res.status(400).json({ error: 'verified field must be a boolean' });
    }

    const updateResult = await pool.query(
      `UPDATE investor_profiles 
       SET is_verified = $1, 
           verified_by = $2,
           verified_at = CASE WHEN $1 = true THEN NOW() ELSE NULL END
       WHERE id = $3
       RETURNING *`,
      [verified, req.user.id, id]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Investor profile not found' });
    }

    res.json({
      message: verified ? 'Investor profile verified successfully' : 'Investor profile verification removed',
      profile: updateResult.rows[0]
    });
  } catch (error) {
    console.error('Verify investor profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Create or Update Institutional Profile
 */
const createInstitutionalProfile = async (req, res) => {
  try {
    const {
      // Basic Information (Step 1)
      fullName,
      companyWebsite,
      businessEmail,
      countryOfRegistration,
      companyFundName,
      officeLocationCity,
      
      // Investment Profile (Step 2)
      typeOfInstitution,
      targetCompanySize,
      assetsUnderManagement,
      preferredRegions,
      typicalDealTicketSize,
      dealStagePreference,
      sectorsOfInterest,
      
      // Verification & Compliance (Step 3)
      fundDocumentUrl,
      websiteReference,
      additionalMessage,
      ndaConsent
    } = req.body;

    // Validate required fields
    if (!fullName || !companyFundName) {
      return res.status(400).json({ 
        error: 'Full name and company/fund name are required' 
      });
    }

    // Check if profile already exists for this user
    const existingProfile = await pool.query(
      'SELECT id FROM institutional_profiles WHERE user_id = $1',
      [req.user.id]
    );

    if (existingProfile.rows.length > 0) {
      // Update existing profile
      const profileId = existingProfile.rows[0].id;
      
      const updateResult = await pool.query(
        `UPDATE institutional_profiles SET
          full_name = $1,
          company_website = $2,
          business_email = $3,
          country_of_registration = $4,
          company_fund_name = $5,
          office_location_city = $6,
          type_of_institution = $7,
          target_company_size = $8,
          assets_under_management = $9,
          preferred_regions = $10,
          typical_deal_ticket_size = $11,
          deal_stage_preference = $12,
          sectors_of_interest = $13,
          fund_document_url = $14,
          website_reference = $15,
          additional_message = $16,
          nda_consent = $17,
          is_verified = false,
          verified_by = NULL,
          verified_at = NULL
        WHERE id = $18
        RETURNING *`,
        [
          fullName,
          companyWebsite || null,
          businessEmail || null,
          countryOfRegistration || null,
          companyFundName,
          officeLocationCity || null,
          typeOfInstitution || null,
          targetCompanySize || null,
          assetsUnderManagement || null,
          preferredRegions || null,
          typicalDealTicketSize || null,
          dealStagePreference || null,
          sectorsOfInterest || null,
          fundDocumentUrl || null,
          websiteReference || null,
          additionalMessage || null,
          ndaConsent || false,
          profileId
        ]
      );

      return res.json({
        message: 'Institutional profile updated successfully',
        profile: updateResult.rows[0],
        isVerified: false
      });
    } else {
      // Create new profile
      const insertResult = await pool.query(
        `INSERT INTO institutional_profiles (
          user_id, full_name, company_website, business_email,
          country_of_registration, company_fund_name, office_location_city,
          type_of_institution, target_company_size, assets_under_management,
          preferred_regions, typical_deal_ticket_size, deal_stage_preference,
          sectors_of_interest, fund_document_url, website_reference,
          additional_message, nda_consent, is_verified
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING *`,
        [
          req.user.id,
          fullName,
          companyWebsite || null,
          businessEmail || null,
          countryOfRegistration || null,
          companyFundName,
          officeLocationCity || null,
          typeOfInstitution || null,
          targetCompanySize || null,
          assetsUnderManagement || null,
          preferredRegions || null,
          typicalDealTicketSize || null,
          dealStagePreference || null,
          sectorsOfInterest || null,
          fundDocumentUrl || null,
          websiteReference || null,
          additionalMessage || null,
          ndaConsent || false,
          false // is_verified defaults to false
        ]
      );

      return res.status(201).json({
        message: 'Institutional profile created successfully. Awaiting verification.',
        profile: insertResult.rows[0],
        isVerified: false
      });
    }
  } catch (error) {
    console.error('Institutional profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get Institutional Profile
 */
const getInstitutionalProfile = async (req, res) => {
  try {
    const profileResult = await pool.query(
      'SELECT * FROM institutional_profiles WHERE user_id = $1',
      [req.user.id]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Institutional profile not found' });
    }

    res.json({
      profile: profileResult.rows[0]
    });
  } catch (error) {
    console.error('Get institutional profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Verify Institutional Profile
 */
const verifyInstitutionalProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { verified } = req.body;

    if (typeof verified !== 'boolean') {
      return res.status(400).json({ error: 'verified field must be a boolean' });
    }

    const updateResult = await pool.query(
      `UPDATE institutional_profiles 
       SET is_verified = $1, 
           verified_by = $2,
           verified_at = CASE WHEN $1 = true THEN NOW() ELSE NULL END
       WHERE id = $3
       RETURNING *`,
      [verified, req.user.id, id]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Institutional profile not found' });
    }

    res.json({
      message: verified ? 'Institutional profile verified successfully' : 'Institutional profile verification removed',
      profile: updateResult.rows[0]
    });
  } catch (error) {
    console.error('Verify institutional profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  signup,
  verifyOtp,
  resendOtp,
  login,
  getMe,
  assignRole,
  createCompanyProfile,
  getCompanyProfile,
  verifyCompanyProfile,
  createInvestorProfile,
  getInvestorProfile,
  verifyInvestorProfile,
  createInstitutionalProfile,
  getInstitutionalProfile,
  verifyInstitutionalProfile
};
