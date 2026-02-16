const express = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize, requireRole } = require('../middleware/authorize');
const {
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
  verifyInstitutionalProfile,
  forgotPassword,
  resetPassword
} = require('../controllers/authController');

const router = express.Router();

/**
 * POST /api/auth/signup
 * Register a new user
 * Body: { fullName, email, password, company, userType }
 */
router.post('/signup', signup);

/**
 * POST /api/auth/verify-otp
 * Verify OTP and activate user account
 * Body: { email, otp }
 */
router.post('/verify-otp', verifyOtp);

/**
 * POST /api/auth/resend-otp
 * Resend OTP to user's email
 * Body: { email }
 */
router.post('/resend-otp', resendOtp);

/**
 * POST /api/auth/login
 * Login user
 * Body: { email, password }
 */
router.post('/login', login);

/**
 * POST /api/auth/forgot-password
 * Request password reset OTP
 * Body: { email }
 */
router.post('/forgot-password', forgotPassword);

/**
 * POST /api/auth/reset-password
 * Reset password using OTP
 * Body: { email, otp, newPassword }
 */
router.post('/reset-password', resetPassword);

/**
 * GET /api/auth/me
 * Get current user info (requires authentication)
 */
router.get('/me', authenticate, getMe);

/**
 * POST /api/auth/assign-role
 * Assign a role to a user (requires superadmin or admin with permission)
 * Body: { userId, roleId }
 */
router.post('/assign-role', 
  authenticate, 
  requireRole(['superadmin', 'admin']),
  authorize('assign-role', 'user'),
  assignRole
);

/**
 * POST /api/auth/company-profile
 * Create or update company profile (for investor/seller users)
 * Body: All company profile fields from the form
 */
router.post('/company-profile', authenticate, requireRole(['investor', 'seller']), createCompanyProfile);

/**
 * GET /api/auth/company-profile
 * Get current user's company profile
 */
router.get('/company-profile', authenticate, requireRole(['investor', 'seller']), getCompanyProfile);

/**
 * PUT /api/auth/company-profile/verify/:id
 * Verify company profile (superadmin only)
 * Body: { verified: true/false }
 */
router.put('/company-profile/verify/:id',
  authenticate,
  requireRole('superadmin'),
  verifyCompanyProfile
);

/**
 * POST /api/auth/investor-profile
 * Create or update investor profile (for investor users only)
 * Body: { fullName, firmSize, primaryMarkets, investmentFocus, contactNumber }
 */
router.post('/investor-profile', authenticate, requireRole('investor'), createInvestorProfile);

/**
 * GET /api/auth/investor-profile
 * Get current user's investor profile
 */
router.get('/investor-profile', authenticate, requireRole('investor'), getInvestorProfile);

/**
 * PUT /api/auth/investor-profile/verify/:id
 * Verify investor profile (superadmin only)
 * Body: { verified: true/false }
 */
router.put('/investor-profile/verify/:id',
  authenticate,
  requireRole('superadmin'),
  verifyInvestorProfile
);

/**
 * POST /api/auth/institutional-profile
 * Create or update institutional profile (for investor users only)
 * Body: All institutional profile fields from the form
 */
router.post('/institutional-profile', authenticate, requireRole('investor'), createInstitutionalProfile);

/**
 * GET /api/auth/institutional-profile
 * Get current user's institutional profile
 */
router.get('/institutional-profile', authenticate, requireRole('investor'), getInstitutionalProfile);

/**
 * PUT /api/auth/institutional-profile/verify/:id
 * Verify institutional profile (superadmin only)
 * Body: { verified: true/false }
 */
router.put('/institutional-profile/verify/:id',
  authenticate,
  requireRole('superadmin'),
  verifyInstitutionalProfile
);

module.exports = router;
