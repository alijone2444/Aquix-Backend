const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getUserProfile } = require('../controllers/usersController');

const router = express.Router();

// All user routes require authentication
router.use(authenticate);

/**
 * GET /api/users
 * Get current user's complete profile with all related data
 * Returns:
 * - User info with roles and permissions
 * - For investors: institutional_profile and investor_profile
 * - For sellers: company_profile
 */
router.get('/', getUserProfile);

module.exports = router;

