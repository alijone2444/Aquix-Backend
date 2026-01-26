const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function runMigration() {
    if (!process.env.DATABASE_URL) {
        console.error("Error: DATABASE_URL is not set.");
        process.exit(1);
    }

    const client = new Client({ connectionString: process.env.DATABASE_URL });

    try {
        await client.connect();
        console.log("Connected to database. Altering company_valuation_models table...");

        const query = `
            ALTER TABLE company_valuation_models
            ALTER COLUMN val_ev_low_eur TYPE VARCHAR(50),
            ALTER COLUMN val_ev_mid_eur TYPE VARCHAR(50),
            ALTER COLUMN val_ev_high_eur TYPE VARCHAR(50);
        `;

        await client.query(query);
        console.log("Table company_valuation_models altered successfully.");

    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await client.end();
    }
}

runMigration();
