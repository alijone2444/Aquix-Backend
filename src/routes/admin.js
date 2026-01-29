const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/authorize');
const { getUserManagement, getInvestors } = require('../controllers/adminController');

const router = express.Router();

// All admin routes require authentication and admin/superadmin role
router.use(authenticate);
router.use(requireRole(['admin', 'superadmin']));

/**
 * GET /api/admin/user-management
 * Get all investors and sellers with their profiles
 */
router.get('/user-management', getUserManagement);

/**
 * GET /api/admin/investors
 * Get all investors with unverified profiles (investorProfile and/or institutionalProfile)
 * Returns only investors whose profiles are NOT verified (is_verified = false)
 */
router.get('/investors', getInvestors);

module.exports = router;

