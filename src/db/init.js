const fs = require('fs');
const path = require('path');
const pool = require('../db');

/**
 * Initialize database schema by executing the schema.sql file
 * This should be run once to set up the database tables
 */
async function initializeDatabase() {
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute the schema SQL
    await pool.query(schemaSQL);
    console.log('Database schema initialized successfully');
  } catch (error) {
    console.error('Error initializing database schema:', error);
    throw error;
  }
}

/**
 * Helper function to find constant ID by type and key
 */
async function findConstantId(constantType, constantKey) {
  try {
    const result = await pool.query(
      'SELECT id FROM constants WHERE constant_type = $1 AND constant_key = $2',
      [constantType, constantKey]
    );
    return result.rows.length > 0 ? result.rows[0].id : null;
  } catch (error) {
    console.error('Error finding constant:', error);
    return null;
  }
}

module.exports = {
  initializeDatabase,
  findConstantId
};

