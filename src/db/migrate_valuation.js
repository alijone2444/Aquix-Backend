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
        console.log("Connected to database. Creating company_valuation_models table...");

        const query = `
            CREATE TABLE IF NOT EXISTS company_valuation_models (
                id SERIAL PRIMARY KEY,
                
                -- 1. IDENTIFICATION
                company_name VARCHAR(255) NOT NULL,
                sector VARCHAR(100),            -- e.g., 'Consumer Electronics Brands'
                country_code CHAR(2),           -- e.g., 'US'
                currency_code CHAR(3),          -- e.g., 'USD'
                employees INT,                  -- e.g., 161000
                
                -- 2. HISTORICAL FINANCIALS (Y1=Last Year, Y3=3 Years Ago)
                revenue_y1 BIGINT,              -- 394,328,000,000
                revenue_y2 BIGINT,
                revenue_y3 BIGINT,
                ebit_y1 BIGINT,                 -- 114,301,000,000
                ebit_y2 BIGINT,
                ebit_y3 BIGINT,

                -- 3. FORECAST FINANCIALS (F1=Next Year)
                revenue_f1 BIGINT,
                revenue_f2 BIGINT,
                revenue_f3 BIGINT,
                ebit_f1 BIGINT,
                ebit_f2 BIGINT,
                ebit_f3 BIGINT,

                -- 4. RISK & OPERATIONS INPUTS
                top3_concentration_pct DECIMAL(5, 2), -- 25.00
                founder_dependency_high BOOLEAN,      -- 'No' -> FALSE
                supplier_dependency_high BOOLEAN,     -- 'No' -> FALSE
                key_staff_retention_plan BOOLEAN,     -- 'Yes' -> TRUE
                documentation_readiness VARCHAR(50),  -- 'Full', 'Partial'
                seller_flexibility VARCHAR(50),       -- 'High', 'Medium', 'Low'
                target_timeline_months INT,           -- 3

                -- 5. BACKEND HELPERS & CALCULATED LOOKUPS
                -- Storing these allows you to "freeze" a valuation version
                calc_fx_rate DECIMAL(10, 4),          -- 0.93
                calc_rev_avg_eur BIGINT,              -- 320,744,600,000
                calc_ebit_avg_eur BIGINT,
                calc_ebit_margin_pct DECIMAL(10, 2),  -- 27.98
                calc_ebit_cagr_pct DECIMAL(10, 2),    -- -23.85
                calc_volatility_pct DECIMAL(10, 2),   -- 27.26
                calc_rev_cagr_pct DECIMAL(10, 2),     -- -16.56
                
                -- 6. VALUATION FACTORS
                factor_base_multiple DECIMAL(5, 2),   -- 11.00
                factor_country_risk DECIMAL(5, 2),    -- 0.20
                factor_size_adj DECIMAL(5, 2),        -- 0.60
                factor_conc_adj DECIMAL(5, 2),        -- 0.00
                factor_adj_multiple DECIMAL(5, 2),    -- 11.80
                
                -- 7. FINAL OUTPUTS
                val_ev_low_eur BIGINT,                -- 74,606,880,000
                val_ev_mid_eur BIGINT,                -- 87,772,800,000
                val_ev_high_eur BIGINT,               -- 100,938,720,000

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        await client.query(query);
        console.log("Table company_valuation_models created successfully.");

    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await client.end();
    }
}

runMigration();
