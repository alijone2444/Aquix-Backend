const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/authorize');
const { getCompanyProfiles } = require('../controllers/investorController');

const router = express.Router();

router.use(authenticate);
router.use(requireRole(['investor']));

/**
 * GET /api/investor/companies
 * List all verified sellers' company profiles (investment opportunities).
 * For investor dashboard - company cards list.
 */
router.get('/companies', getCompanyProfiles);

module.exports = router;
