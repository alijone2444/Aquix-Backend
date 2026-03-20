-- ============================================
-- Constant Reference Tables
-- ============================================

CREATE TABLE IF NOT EXISTS constant_sector_metrics (
    subsector_id VARCHAR(50) PRIMARY KEY,
    sector_id VARCHAR(20),
    sector_en VARCHAR(100),
    sector_de VARCHAR(100),
    subsector_en VARCHAR(255),
    subsector_de VARCHAR(255),
    subsector_name_updated VARCHAR(255),
    base_ebit_multiple DECIMAL(10, 2),    -- e.g., 17.50
    target_ebit_margin_pct DECIMAL(5, 2), -- e.g., 32.50
    target_cagr_pct DECIMAL(5, 2),        -- e.g., 17.50
    band_min DECIMAL(10, 2),              -- e.g., 10.00
    score INT                             -- MISSING IN YOUR CODE: e.g., 85, 82
);

CREATE TABLE IF NOT EXISTS constant_country_adjustments (
    country_code CHAR(2) PRIMARY KEY, -- e.g., 'US', 'DE'
    delta_multiple DECIMAL(5, 2)      -- e.g., 0.20, -0.30
);

CREATE TABLE IF NOT EXISTS constant_size_adjustments (
    rev_min_eur BIGINT PRIMARY KEY,  -- Using BIGINT for large currency numbers
    delta_multiple DECIMAL(5, 2)     -- e.g., -0.50, 0.60
);

CREATE TABLE IF NOT EXISTS constant_concentration_adjustments (
    top3_min_pct INT PRIMARY KEY,    -- e.g., 30, 45
    delta_multiple DECIMAL(5, 2)     -- e.g., -0.30, 0.10
);

CREATE TABLE IF NOT EXISTS constant_fx_rates (
    currency_code CHAR(3) PRIMARY KEY, -- e.g., 'USD', 'GBP'
    rate_to_eur DECIMAL(10, 4)         -- e.g., 1.1700 (4 decimals for precision)
);

CREATE TABLE IF NOT EXISTS constant_deal_size_scores (
    ev_min_eur BIGINT PRIMARY KEY,
    size_score INT                     -- e.g., 40, 60, 95
);

CREATE TABLE IF NOT EXISTS constant_credit_ratings (
    rating VARCHAR(10) PRIMARY KEY,   -- e.g., 'AAA', 'BBB-'
    score INT                         -- e.g., 98, 84
);

CREATE TABLE IF NOT EXISTS company_enterprise_valuation_models (
    id SERIAL PRIMARY KEY,

    -- 1. IDENTIFICATION
    company_name VARCHAR(255) NOT NULL,
    sector VARCHAR(100),                -- Maps to 'Sector' (e.g. 'Consumer Electronics Brands')
    country_code CHAR(2),               -- Maps to 'Country'
    currency_code CHAR(3),              -- Maps to 'Currency'
    valuation_date DATE,                -- ADDED: Maps to 'Val Date'
    employees INT,                      -- Maps to 'Employees'

    -- 2. HISTORICAL FINANCIALS (Y1=Last Year)
    revenue_y1 BIGINT,
    revenue_y2 BIGINT,
    revenue_y3 BIGINT,
    ebit_y1 BIGINT,
    ebit_y2 BIGINT,
    ebit_y3 BIGINT,

    -- 3. FORECAST FINANCIALS (F1=Next Year)
    revenue_f1 BIGINT,
    revenue_f2 BIGINT,
    revenue_f3 BIGINT,
    ebit_f1 BIGINT,
    ebit_f2 BIGINT,
    ebit_f3 BIGINT,

    -- 4. FINANCIAL HEALTH & CAPITAL STRUCTURE (NEW SECTION)
    total_debt BIGINT,                  -- ADDED
    current_assets BIGINT,              -- ADDED
    current_liabilities BIGINT,         -- ADDED
    credit_rating VARCHAR(10),          -- ADDED: Maps to 'Credit Rating'
    ownership_pct DECIMAL(5, 2),        -- ADDED: Maps to 'Ownership %'
    mgmt_turnover_pct DECIMAL(5, 2),    -- ADDED: Maps to 'Mgmt Turnover %'
    litigation_active BOOLEAN,          -- ADDED: Maps to 'Litigation?'

    -- 5. RISK & OPERATIONS INPUTS
    top3_concentration_pct DECIMAL(5, 2),
    founder_dependency_high BOOLEAN,    -- Maps to 'Founder dep?'
    supplier_dependency_high BOOLEAN,   -- Maps to 'Supplier dep?'
    key_staff_retention_plan BOOLEAN,   -- Maps to 'Staff plan?'
    financials_audited BOOLEAN,         -- ADDED: Maps to 'Audited?'
    documentation_readiness VARCHAR(50),
    seller_flexibility VARCHAR(50),     -- Maps to 'Flexibility?'
    target_timeline_months INT,         -- Maps to 'Timeline'

    -- 6. BACKEND HELPERS & CALCULATED LOOKUPS
    calc_fx_rate DECIMAL(10, 4),
    calc_rev_avg_eur BIGINT,            -- Maps to 'Rev AVG - Historical'
    calc_ebit_avg_eur BIGINT,           -- Maps to 'EBIT AVG - Historical'
    calc_ebit_margin_pct DECIMAL(10, 2),
    calc_ebit_cagr_pct DECIMAL(10, 2),
    calc_volatility_pct DECIMAL(10, 2),
    calc_rev_cagr_pct DECIMAL(10, 2),
    calc_debt_ebitda_ratio DECIMAL(10, 2), -- ADDED: Maps to 'Debt/EBITDA'
    calc_current_ratio DECIMAL(10, 2),     -- ADDED: Maps to 'Current Ratio'

    -- 7. VALUATION FACTORS
    factor_base_multiple DECIMAL(5, 2),
    factor_country_risk DECIMAL(5, 2),
    factor_size_adj DECIMAL(5, 2),
    factor_conc_adj DECIMAL(5, 2),      -- Maps to 'Customer Concentration Adjustment'
    factor_adj_multiple DECIMAL(5, 2),

    -- 8. FINAL OUTPUTS
    val_norm_ebit_eur BIGINT,           -- ADDED: Maps to 'Norm EBIT'
    val_ev_low_eur VARCHAR(50),         -- Kept as VARCHAR to match '74,606k EUR' format
    val_ev_mid_eur VARCHAR(50),
    val_ev_high_eur VARCHAR(50),

    -- 9. ADDITIONAL SCORING & METRICS
    financial_strength INT,
    risk_management INT,
    market_context INT,
    dealability_size_subscore INT,
    dealability_documentation_subscore INT,
    dealability_flexibility_subscore INT,
    dealability_timeline_subscore INT,
    dealability_score INT,
    valuation_reliability VARCHAR(50),
    fx_confidence VARCHAR(50),
    peer_gap_pct DECIMAL(5, 2),
    age_warning VARCHAR(255),
    inst_bonus DECIMAL(5, 2),
    risk_flags TEXT,
    tapway_institutional_score INT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS company_standard_valuation_models (
    id SERIAL PRIMARY KEY,

    -- 1. IDENTIFICATION
    company_name VARCHAR(255) NOT NULL,
    sector VARCHAR(100),
    country_code CHAR(2),
    currency_code CHAR(3),
    employees INT,

    -- 2. HISTORICAL FINANCIALS
    revenue_y1 BIGINT,
    revenue_y2 BIGINT,
    revenue_y3 BIGINT,
    ebit_y1 BIGINT,
    ebit_y2 BIGINT,
    ebit_y3 BIGINT,

    -- 3. FORECAST FINANCIALS
    revenue_f1 BIGINT,
    revenue_f2 BIGINT,
    revenue_f3 BIGINT,
    ebit_f1 BIGINT,
    ebit_f2 BIGINT,
    ebit_f3 BIGINT,

    -- 4. RISK & OPERATIONS INPUTS
    top3_concentration_pct DECIMAL(5, 2),
    founder_dependency_high BOOLEAN,
    supplier_dependency_high BOOLEAN,
    key_staff_retention_plan BOOLEAN,
    documentation_readiness VARCHAR(50),
    seller_flexibility VARCHAR(50),
    target_timeline_months INT,

    -- 5. BACKEND HELPERS & CALCULATED LOOKUPS
    calc_fx_rate DECIMAL(10, 4),
    calc_rev_avg_eur BIGINT,
    calc_ebit_avg_eur BIGINT,
    calc_ebit_margin_pct DECIMAL(10, 2),
    calc_ebit_cagr_pct DECIMAL(10, 2),
    calc_volatility_pct DECIMAL(10, 2),
    calc_rev_cagr_pct DECIMAL(10, 2),

    factor_base_multiple DECIMAL(5, 2),
    factor_country_risk DECIMAL(5, 2),
    factor_size_adj DECIMAL(5, 2),
    factor_conc_adj DECIMAL(5, 2),
    factor_adj_multiple DECIMAL(5, 2),

    val_ev_low_eur VARCHAR(50),
    val_ev_mid_eur VARCHAR(50),
    val_ev_high_eur VARCHAR(50),

    -- 6. SCORING & METRICS
    financial_strength INT,          -- "Financial Quality"
    growth_score INT,                -- NEW
    risk_management INT,
    data_completeness INT,           -- NEW
    sector_context INT,              -- NEW
    investment_attractiveness INT,   -- NEW: Aggregation

    dealability_size_subscore INT,
    dealability_documentation_subscore INT,
    dealability_flexibility_subscore INT,
    dealability_timeline_subscore INT,
    dealability_score INT,

    risk_flags TEXT,
    tapway_score INT,                -- "TAPWAY SCORE"

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS company_free_valuation_models (
    id SERIAL PRIMARY KEY,
    
    -- OPTIONAL: Identifier if you are saving specific company runs
    company_name VARCHAR(255), 

    -- 1. INPUTS
    sector VARCHAR(100),                -- Industry/Sector
    country VARCHAR(100),               -- Country/Region
    annual_revenue BIGINT,              -- Annual Revenue
    ebit BIGINT,                        -- EBIT (Operating Profit)
    currency CHAR(3),                   -- Currency
    employees INT,                      -- Number of Employees (Optional)
    top3_customers_pct DECIMAL(5, 2),   -- Top 3 Customers % (Optional)

    -- 2. BACKEND CALCULATIONS
    calc_fx_rate_to_eur DECIMAL(10, 4), -- FX Rate to EUR
    calc_ebit_eur BIGINT,               -- EBIT (EUR)
    
    factor_base_ebit_multiple DECIMAL(5, 2),      -- Base EBIT Multiple
    factor_country_risk DECIMAL(5, 2),            -- Country Risk Factor
    factor_size_adj DECIMAL(5, 2),                -- Size Adjustment Factor
    factor_conc_adj DECIMAL(5, 2),                -- Customer Concentration Adjustment

    -- 3. VALUATION OUTPUT
    val_calc_adj_multiple DECIMAL(5, 2),          -- Calculated Adjusted Multiple
    
    -- Mid-Point
    val_ev_mid BIGINT,                            -- Enterprise Value (Mid-point)
    val_ev_mid_eur_k VARCHAR(50),                      -- Enterprise Value (Mid-point) (000 EUR)

    -- Low Range (85%)
    val_ev_low BIGINT,                            -- Low (Calculated)
    val_ev_low_eur_k VARCHAR(50),                      -- Low (Calculated) (000 EUR)

    -- High Range (115%)
    val_ev_high BIGINT,                           -- High (Calculated)
    val_ev_high_eur_k VARCHAR(50),                     -- High (Calculated) (000 EUR)

    -- 4. SCORING & CHECKS
    risk_comment TEXT,                            -- Risk Comment
    plausibility_check VARCHAR(255),              -- Plausibility Check
    acquisition_score INT,                        -- Acquisition Score (0-100)

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
