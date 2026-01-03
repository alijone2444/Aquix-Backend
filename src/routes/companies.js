const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/companies/constants
// Fetch all company constants
router.get('/constants', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM company_constants ORDER BY company_name');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching company constants:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/companies/financials
// Fetch all company financial data
router.get('/financials', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM company_financial_data ORDER BY company_name');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching company financial data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/companies/:companyName/constants
// Fetch constants for a specific company
router.get('/:companyName/constants', async (req, res) => {
    try {
        const companyName = decodeURIComponent(req.params.companyName);
        const result = await pool.query(
            'SELECT * FROM company_constants WHERE company_name = $1',
            [companyName]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Company not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching company constants:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/companies/:companyName/financials
// Fetch financial data for a specific company
router.get('/:companyName/financials', async (req, res) => {
    try {
        const companyName = decodeURIComponent(req.params.companyName);
        const result = await pool.query(
            'SELECT * FROM company_financial_data WHERE company_name = $1',
            [companyName]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Company not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching company financial data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
