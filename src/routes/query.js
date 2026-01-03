const express = require('express');
const router = express.Router();
const pool = require('../db');

// POST /api/query
// Execute raw SQL query
router.post('/', async (req, res) => {
    try {
        const { query } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        console.log(`Executing raw query: ${query}`);

        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error executing raw query:', error);
        res.status(400).json({
            error: 'Query execution failed',
            details: error.message
        });
    }
});

module.exports = router;
