const express = require('express');
const router = express.Router();
const pool = require('../db');

// Get all user inputs with joined constant values
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT 
        ui.*,
        base_ebit.constant_value as base_ebit_multiple_value,
        base_ebit.constant_key as base_ebit_multiple_key,
        base_ebit.description as base_ebit_multiple_description,
        country_risk.constant_value as country_risk_factor_value,
        country_risk.constant_key as country_risk_factor_key,
        country_risk.description as country_risk_factor_description,
        size_adj.constant_value as size_adjustment_factor_value,
        size_adj.constant_key as size_adjustment_factor_key,
        size_adj.description as size_adjustment_factor_description,
        cust_conc.constant_value as customer_concentration_adjustment_value,
        cust_conc.constant_key as customer_concentration_adjustment_key,
        cust_conc.description as customer_concentration_adjustment_description
      FROM user_input ui
      LEFT JOIN constants base_ebit ON ui.base_ebit_multiple_id = base_ebit.id
      LEFT JOIN constants country_risk ON ui.country_risk_factor_id = country_risk.id
      LEFT JOIN constants size_adj ON ui.size_adjustment_factor_id = size_adj.id
      LEFT JOIN constants cust_conc ON ui.customer_concentration_adjustment_id = cust_conc.id
      ORDER BY ui.created_at DESC
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching user inputs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user input by ID with joined constant values
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const query = `
      SELECT 
        ui.*,
        base_ebit.constant_value as base_ebit_multiple_value,
        base_ebit.constant_key as base_ebit_multiple_key,
        base_ebit.description as base_ebit_multiple_description,
        country_risk.constant_value as country_risk_factor_value,
        country_risk.constant_key as country_risk_factor_key,
        country_risk.description as country_risk_factor_description,
        size_adj.constant_value as size_adjustment_factor_value,
        size_adj.constant_key as size_adjustment_factor_key,
        size_adj.description as size_adjustment_factor_description,
        cust_conc.constant_value as customer_concentration_adjustment_value,
        cust_conc.constant_key as customer_concentration_adjustment_key,
        cust_conc.description as customer_concentration_adjustment_description
      FROM user_input ui
      LEFT JOIN constants base_ebit ON ui.base_ebit_multiple_id = base_ebit.id
      LEFT JOIN constants country_risk ON ui.country_risk_factor_id = country_risk.id
      LEFT JOIN constants size_adj ON ui.size_adjustment_factor_id = size_adj.id
      LEFT JOIN constants cust_conc ON ui.customer_concentration_adjustment_id = cust_conc.id
      WHERE ui.id = $1
    `;
    
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User input not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching user input:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new user input
router.post('/', async (req, res) => {
  try {
    const {
      industry_sector,
      country_region,
      annual_revenue,
      ebit,
      currency,
      number_of_employees,
      top_3_customers_percent,
      base_ebit_multiple_id,
      country_risk_factor_id,
      size_adjustment_factor_id,
      customer_concentration_adjustment_id
    } = req.body;
    
    // Validate required fields
    if (!industry_sector || !country_region || annual_revenue === undefined || ebit === undefined) {
      return res.status(400).json({ 
        error: 'industry_sector, country_region, annual_revenue, and ebit are required' 
      });
    }
    
    // Validate currency format (optional, defaults to USD)
    const validCurrency = currency || 'USD';
    
    // Insert user input
    const result = await pool.query(
      `INSERT INTO user_input (
        industry_sector, country_region, annual_revenue, ebit, currency,
        number_of_employees, top_3_customers_percent,
        base_ebit_multiple_id, country_risk_factor_id,
        size_adjustment_factor_id, customer_concentration_adjustment_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        industry_sector,
        country_region,
        annual_revenue,
        ebit,
        validCurrency,
        number_of_employees || null,
        top_3_customers_percent || null,
        base_ebit_multiple_id || null,
        country_risk_factor_id || null,
        size_adjustment_factor_id || null,
        customer_concentration_adjustment_id || null
      ]
    );
    
    // Fetch the created record with joined constants
    const fetchQuery = `
      SELECT 
        ui.*,
        base_ebit.constant_value as base_ebit_multiple_value,
        base_ebit.constant_key as base_ebit_multiple_key,
        base_ebit.description as base_ebit_multiple_description,
        country_risk.constant_value as country_risk_factor_value,
        country_risk.constant_key as country_risk_factor_key,
        country_risk.description as country_risk_factor_description,
        size_adj.constant_value as size_adjustment_factor_value,
        size_adj.constant_key as size_adjustment_factor_key,
        size_adj.description as size_adjustment_factor_description,
        cust_conc.constant_value as customer_concentration_adjustment_value,
        cust_conc.constant_key as customer_concentration_adjustment_key,
        cust_conc.description as customer_concentration_adjustment_description
      FROM user_input ui
      LEFT JOIN constants base_ebit ON ui.base_ebit_multiple_id = base_ebit.id
      LEFT JOIN constants country_risk ON ui.country_risk_factor_id = country_risk.id
      LEFT JOIN constants size_adj ON ui.size_adjustment_factor_id = size_adj.id
      LEFT JOIN constants cust_conc ON ui.customer_concentration_adjustment_id = cust_conc.id
      WHERE ui.id = $1
    `;
    
    const fullResult = await pool.query(fetchQuery, [result.rows[0].id]);
    
    res.status(201).json(fullResult.rows[0]);
  } catch (error) {
    if (error.code === '23503') { // Foreign key violation
      return res.status(400).json({ 
        error: 'Invalid constant reference: one or more constant IDs do not exist' 
      });
    }
    console.error('Error creating user input:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user input
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      industry_sector,
      country_region,
      annual_revenue,
      ebit,
      currency,
      number_of_employees,
      top_3_customers_percent,
      base_ebit_multiple_id,
      country_risk_factor_id,
      size_adjustment_factor_id,
      customer_concentration_adjustment_id
    } = req.body;
    
    const result = await pool.query(
      `UPDATE user_input 
       SET industry_sector = COALESCE($1, industry_sector),
           country_region = COALESCE($2, country_region),
           annual_revenue = COALESCE($3, annual_revenue),
           ebit = COALESCE($4, ebit),
           currency = COALESCE($5, currency),
           number_of_employees = COALESCE($6, number_of_employees),
           top_3_customers_percent = COALESCE($7, top_3_customers_percent),
           base_ebit_multiple_id = COALESCE($8, base_ebit_multiple_id),
           country_risk_factor_id = COALESCE($9, country_risk_factor_id),
           size_adjustment_factor_id = COALESCE($10, size_adjustment_factor_id),
           customer_concentration_adjustment_id = COALESCE($11, customer_concentration_adjustment_id)
       WHERE id = $12 RETURNING *`,
      [
        industry_sector, country_region, annual_revenue, ebit, currency,
        number_of_employees, top_3_customers_percent,
        base_ebit_multiple_id, country_risk_factor_id,
        size_adjustment_factor_id, customer_concentration_adjustment_id, id
      ]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User input not found' });
    }
    
    // Fetch the updated record with joined constants
    const fetchQuery = `
      SELECT 
        ui.*,
        base_ebit.constant_value as base_ebit_multiple_value,
        base_ebit.constant_key as base_ebit_multiple_key,
        base_ebit.description as base_ebit_multiple_description,
        country_risk.constant_value as country_risk_factor_value,
        country_risk.constant_key as country_risk_factor_key,
        country_risk.description as country_risk_factor_description,
        size_adj.constant_value as size_adjustment_factor_value,
        size_adj.constant_key as size_adjustment_factor_key,
        size_adj.description as size_adjustment_factor_description,
        cust_conc.constant_value as customer_concentration_adjustment_value,
        cust_conc.constant_key as customer_concentration_adjustment_key,
        cust_conc.description as customer_concentration_adjustment_description
      FROM user_input ui
      LEFT JOIN constants base_ebit ON ui.base_ebit_multiple_id = base_ebit.id
      LEFT JOIN constants country_risk ON ui.country_risk_factor_id = country_risk.id
      LEFT JOIN constants size_adj ON ui.size_adjustment_factor_id = size_adj.id
      LEFT JOIN constants cust_conc ON ui.customer_concentration_adjustment_id = cust_conc.id
      WHERE ui.id = $1
    `;
    
    const fullResult = await pool.query(fetchQuery, [id]);
    
    res.json(fullResult.rows[0]);
  } catch (error) {
    if (error.code === '23503') { // Foreign key violation
      return res.status(400).json({ 
        error: 'Invalid constant reference: one or more constant IDs do not exist' 
      });
    }
    console.error('Error updating user input:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete user input
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM user_input WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User input not found' });
    }
    
    res.json({ message: 'User input deleted successfully' });
  } catch (error) {
    console.error('Error deleting user input:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

