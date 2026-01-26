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
        console.log("Connected to database. Creating tables...");

        const queries = [
            `CREATE TABLE IF NOT EXISTS constant_sector_metrics (
                subsector_id VARCHAR(50) PRIMARY KEY,
                sector_id VARCHAR(20),
                sector_en VARCHAR(100),
                sector_de VARCHAR(100),
                subsector_en VARCHAR(255),
                subsector_de VARCHAR(255),
                subsector_name_updated VARCHAR(255),
                base_ebit_multiple DECIMAL(10, 2),
                target_ebit_margin_pct DECIMAL(5, 2),
                target_cagr_pct DECIMAL(5, 2),
                band_min DECIMAL(10, 2)
            );`,
            `CREATE TABLE IF NOT EXISTS constant_country_adjustments (
                country_code CHAR(2) PRIMARY KEY,
                delta_multiple DECIMAL(5, 2)
            );`,
            `CREATE TABLE IF NOT EXISTS constant_size_adjustments (
                rev_min_eur BIGINT PRIMARY KEY,
                delta_multiple DECIMAL(5, 2)
            );`,
            `CREATE TABLE IF NOT EXISTS constant_concentration_adjustments (
                top3_min_pct INT PRIMARY KEY,
                delta_multiple DECIMAL(5, 2)
            );`,
            `CREATE TABLE IF NOT EXISTS constant_fx_rates (
                currency_code CHAR(3) PRIMARY KEY,
                rate_to_eur DECIMAL(10, 4)
            );`,
            `CREATE TABLE IF NOT EXISTS constant_deal_size_scores (
                ev_min_eur BIGINT PRIMARY KEY,
                size_score INT
            );`,
            `CREATE TABLE IF NOT EXISTS constant_credit_ratings (
                rating VARCHAR(10) PRIMARY KEY,
                score INT
            );`
        ];

        for (const query of queries) {
            await client.query(query);
        }

        console.log("All tables created successfully.");

    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await client.end();
    }
}

runMigration();
