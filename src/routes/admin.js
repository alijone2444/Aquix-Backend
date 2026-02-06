const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/authorize');
const { getUserManagement, getInvestors, deleteUser, bulkApproveInvestors } = require('../controllers/adminController');

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
 * Get all investors with complete data (institutional profiles)
 * Returns investors who have institutional profiles regardless of verification status
 */
router.get('/investors', getInvestors);

/**
 * POST /api/admin/investors/bulk-approve
 * Bulk approve or deny investors' profiles
 * Body: { 
 *   approvals: [
 *     { userId: UUID, action: true/false or 1/0 },
 *     ...
 *   ]
 * }
 * - action: true or 1 = approve (set is_verified = true)
 * - action: false or 0 = deny (set is_verified = false)
 * Updates both investor_profiles and institutional_profiles
 * Sets verified_by to current logged-in admin user
 */
router.post('/investors/bulk-approve', bulkApproveInvestors);

/**
 * DELETE /api/admin/user
 * Delete a user (investor, seller, or admin) and all linked data
 * Body: { userId: UUID, userType: 'investor' | 'seller' | 'admin' }
 * This will delete:
 * - User record
 * - User roles
 * - OTPs
 * - Company profiles (for sellers)
 * - Investor profiles (for investors)
 * - Institutional profiles (for investors)
 */
router.delete('/user', deleteUser);

module.exports = router;

