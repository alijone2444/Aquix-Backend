const pool = require('./src/db');

async function checkTables() {
  const tables = [
    'constant_sector_metrics',
    'constant_country_adjustments',
    'constant_size_adjustments',
    'constant_concentration_adjustments',
    'constant_fx_rates',
    'constant_deal_size_scores',
    'constant_credit_ratings',
    'company_enterprise_valuation_models',
    'company_standard_valuation_models',
    'company_free_valuation_models'
  ];

  try {
    for (const table of tables) {
      const res = await pool.query(`SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = '${table}'
      );`);
      console.log(`Table ${table}: ${res.rows[0].exists ? 'EXISTS' : 'MISSING'}`);
    }
  } catch (err) {
    console.error('Error checking tables:', err);
  } finally {
    await pool.end();
  }
}

checkTables();
