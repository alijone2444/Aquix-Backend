const express = require('express');
const router = express.Router();
const { analyzeCompany } = require('../controllers/aiController');

// POST /api/ai/analyze
// Body: { company: "Apple", tier: 1 }
router.post('/analyze', analyzeCompany);

module.exports = router;
