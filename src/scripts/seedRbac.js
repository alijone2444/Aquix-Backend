const fs = require('fs');
const path = require('path');
const pool = require('../db');

/**
 * Seed RBAC data (roles, permissions, and role-permission mappings)
 * Usage: node src/scripts/seedRbac.js
 */
async function seedRbac() {
  try {
    console.log('Seeding RBAC data...');
    
    const seedPath = path.join(__dirname, '../db/rbac_seed.sql');
    const seedSQL = fs.readFileSync(seedPath, 'utf8');
    
    // Execute the seed SQL
    await pool.query(seedSQL);
    
    console.log('✓ RBAC data seeded successfully');
    console.log('\n✅ RBAC seeding complete!');
    console.log('\nInitial roles created:');
    console.log('  - superadmin (full permissions)');
    console.log('  - admin (management permissions)');
    console.log('  - seller (read/create user-input permissions)');
    console.log('  - investor (read permissions)');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ RBAC seeding failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  seedRbac();
}

module.exports = { seedRbac };

