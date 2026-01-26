const bcrypt = require('bcrypt');
const pool = require('../db');

/**
 * Create superadmin user
 * Usage: node src/scripts/seedSuperadmin.js
 */
async function seedSuperadmin() {
  try {
    const email = 'admin@yopmail.com';
    const password = '123456789';
    const fullName = 'Super Admin';

    console.log('Creating superadmin user...');

    // Check if superadmin already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      console.log('Superadmin user already exists. Updating...');
      const userId = existingUser.rows[0].id;

      // Hash password
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Update user
      await pool.query(
        'UPDATE users SET password_hash = $1, is_active = true WHERE id = $2',
        [passwordHash, userId]
      );

      // Get superadmin role
      const roleResult = await pool.query(
        "SELECT id FROM roles WHERE name = 'superadmin'",
        []
      );

      if (roleResult.rows.length > 0) {
        // Check if role already assigned
        const userRoleCheck = await pool.query(
          'SELECT id FROM user_roles WHERE user_id = $1 AND role_id = $2',
          [userId, roleResult.rows[0].id]
        );

        if (userRoleCheck.rows.length === 0) {
          // Assign superadmin role
          await pool.query(
            'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
            [userId, roleResult.rows[0].id]
          );
        }
      }

      console.log('✓ Superadmin user updated successfully');
      console.log('\nCredentials:');
      console.log('  Email: admin@yopmail.com');
      console.log('  Password: 123456789');
      process.exit(0);
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Create user
      const userResult = await pool.query(
        `INSERT INTO users (full_name, email, password_hash, is_active)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [fullName, email, passwordHash, true]
      );

      const userId = userResult.rows[0].id;

      // Get superadmin role
      const roleResult = await pool.query(
        "SELECT id FROM roles WHERE name = 'superadmin'",
        []
      );

      if (roleResult.rows.length === 0) {
        throw new Error('Superadmin role not found. Please run: npm run db:seed:rbac');
      }

      // Assign superadmin role
      await pool.query(
        'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
        [userId, roleResult.rows[0].id]
      );

      await pool.query('COMMIT');

      console.log('✓ Superadmin user created successfully');
      console.log('\nCredentials:');
      console.log('  Email: admin@yopmail.com');
      console.log('  Password: 123456789');
      console.log('\n✅ Superadmin seeding complete!');
      process.exit(0);
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('\n❌ Superadmin seeding failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  seedSuperadmin();
}

module.exports = { seedSuperadmin };

