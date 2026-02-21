const path = require('path');
const fs = require('fs');
const pool = require('../db');

/**
 * Run a SQL migration file
 * Usage: node src/scripts/runMigration.js [migration-name]
 * Example: node src/scripts/runMigration.js add_rejection_reason
 */
async function runMigration(migrationName) {
  const migrationPath = path.join(__dirname, '../db/migrations', `${migrationName}.sql`);
  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Migration not found: ${migrationPath}`);
  }
  const sql = fs.readFileSync(migrationPath, 'utf8');
  await pool.query(sql);
}

async function main() {
  const name = process.argv[2] || 'add_rejection_reason';
  try {
    console.log(`Running migration: ${name}...`);
    await runMigration(name);
    console.log(`✓ Migration ${name} completed`);
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { runMigration };
