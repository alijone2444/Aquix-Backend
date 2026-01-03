const { initializeDatabase } = require('../db/init');

/**
 * Initialize database schema
 * Usage: node src/scripts/initDb.js
 */
async function main() {
  try {
    console.log('Initializing database schema...');
    await initializeDatabase();
    console.log('✓ Database schema initialized');
    console.log('\n✅ Database initialization complete!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database initialization failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

