const express = require('express');
const router = express.Router();
const pool = require('../db');

// Get all constants
router.get('/', async (req, res) => {
  try {
    const { constant_type } = req.query;
    let query = 'SELECT * FROM constants ORDER BY constant_type, constant_key';
    let params = [];

    if (constant_type) {
      query = 'SELECT * FROM constants WHERE constant_type = $1 ORDER BY constant_key';
      params = [constant_type];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching constants:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get constant by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM constants WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Constant not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching constant:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get constants by type and key
router.get('/type/:type/key/:key', async (req, res) => {
  try {
    const { type, key } = req.params;
    const result = await pool.query(
      'SELECT * FROM constants WHERE constant_type = $1 AND constant_key = $2',
      [type, key]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Constant not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching constant:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new constant
router.post('/', async (req, res) => {
  try {
    const { constant_type, constant_key, constant_value, description } = req.body;
    
    if (!constant_type || !constant_key || constant_value === undefined) {
      return res.status(400).json({ 
        error: 'constant_type, constant_key, and constant_value are required' 
      });
    }
    
    const result = await pool.query(
      `INSERT INTO constants (constant_type, constant_key, constant_value, description) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [constant_type, constant_key, constant_value, description || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ 
        error: 'Constant with this type and key already exists' 
      });
    }
    console.error('Error creating constant:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update constant
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { constant_type, constant_key, constant_value, description } = req.body;
    
    const result = await pool.query(
      `UPDATE constants 
       SET constant_type = COALESCE($1, constant_type),
           constant_key = COALESCE($2, constant_key),
           constant_value = COALESCE($3, constant_value),
           description = COALESCE($4, description)
       WHERE id = $5 RETURNING *`,
      [constant_type, constant_key, constant_value, description, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Constant not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ 
        error: 'Constant with this type and key already exists' 
      });
    }
    console.error('Error updating constant:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete constant
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if constant is being used by any user_input
    const usageCheck = await pool.query(
      `SELECT COUNT(*) as count FROM user_input 
       WHERE base_ebit_multiple_id = $1 
          OR country_risk_factor_id = $1 
          OR size_adjustment_factor_id = $1 
          OR customer_concentration_adjustment_id = $1`,
      [id]
    );
    
    if (parseInt(usageCheck.rows[0].count) > 0) {
      return res.status(409).json({ 
        error: 'Cannot delete constant: it is referenced by user input records' 
      });
    }
    
    const result = await pool.query('DELETE FROM constants WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Constant not found' });
    }
    
    res.json({ message: 'Constant deleted successfully' });
  } catch (error) {
    console.error('Error deleting constant:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

