const pool = require('../db');

async function verify() {
    try {
        console.log('Verifying Seed Data...');

        // Check Company Constants
        const constRes = await pool.query('SELECT * FROM company_constants ORDER BY company_name');
        console.log(`\nFound ${constRes.rows.length} records in company_constants.`);
        if (constRes.rows.length > 0) {
            console.log('Sample (Company A):');
            console.log(constRes.rows.find(r => r.company_name === 'Company A'));
        }

        // Check Financial Data
        const finRes = await pool.query('SELECT * FROM company_financial_data ORDER BY company_name');
        console.log(`\nFound ${finRes.rows.length} records in company_financial_data.`);
        if (finRes.rows.length > 0) {
            const compA = finRes.rows.find(r => r.company_name === 'Company A');
            // Log the full object to show all fields
            console.log('Sample (Company A) - FULL RECORD:');
            console.log(JSON.stringify(compA, null, 2));
            console.log('Total columns:', Object.keys(compA).length);
        }

        process.exit(0);
    } catch (error) {
        console.error('Verification failed:', error);
        process.exit(1);
    }
}

verify();
