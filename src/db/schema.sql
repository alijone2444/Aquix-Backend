

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';






-- ============================================
-- RBAC (Role-Based Access Control) Schema
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  company VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  rejection_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- Roles Table
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  is_system_role BOOLEAN DEFAULT false, -- System roles (superadmin, admin, seller, investor) cannot be deleted
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);

-- Permissions Table
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  resource VARCHAR(100) NOT NULL, -- e.g., 'user', 'company', 'query', 'constants'
  action VARCHAR(50) NOT NULL, -- e.g., 'create', 'read', 'update', 'delete', 'approve'
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_permissions_resource_action ON permissions(resource, action);
CREATE INDEX IF NOT EXISTS idx_permissions_name ON permissions(name);

-- User Roles (Many-to-Many: Users can have multiple roles)
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  assigned_by UUID REFERENCES users(id),
  UNIQUE(user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);

-- Role Permissions (Many-to-Many: Roles can have multiple permissions)
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  granted_by UUID REFERENCES users(id),
  UNIQUE(role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);

-- Triggers for RBAC tables
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_roles_updated_at ON roles;
CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- OTP Table for Email Verification
CREATE TABLE IF NOT EXISTS otps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  otp_code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  is_verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_otps_user_id ON otps(user_id);
CREATE INDEX IF NOT EXISTS idx_otps_email ON otps(email);
CREATE INDEX IF NOT EXISTS idx_otps_code ON otps(otp_code);
CREATE INDEX IF NOT EXISTS idx_otps_expires_at ON otps(expires_at);

-- Company Profiles Table
-- Stores company profile information submitted by investors/sellers
CREATE TABLE IF NOT EXISTS company_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Personal & Contact Information (Step 1)
  full_name VARCHAR(255),
  position VARCHAR(255),
  founder_managing_director VARCHAR(255),
  business_email VARCHAR(255),
  company_name VARCHAR(255) NOT NULL,
  country VARCHAR(100),
  phone VARCHAR(50),
  city VARCHAR(100),
  
  -- Company Information (Step 2)
  year_founded INTEGER,
  legal_form VARCHAR(50),
  industry_sector VARCHAR(100),
  number_of_employees INTEGER,
  
  -- Financial Overview (Step 3)
  annual_revenue NUMERIC(20, 2),
  ebit NUMERIC(20, 2),
  current_year_estimate NUMERIC(20, 2),
  currency VARCHAR(10) DEFAULT 'USD',
  customer_concentration_percent NUMERIC(5, 2),
  growth_trend VARCHAR(50),
  
  -- Ownership & Readiness (Step 4)
  ownership_structure VARCHAR(100),
  founder_shares_percent NUMERIC(5, 2),
  succession_planned VARCHAR(10),
  current_advisors VARCHAR(255),
  interested_in_sale VARCHAR(255),
  
  -- Compliance & Consent (Step 5)
  data_upload_url TEXT, -- URL/path to uploaded PDF or Excel file
  nda_consent BOOLEAN DEFAULT false,
  gdpr_consent BOOLEAN DEFAULT false,
  
  -- Verification
  is_verified BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_company_profiles_user_id ON company_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_company_profiles_is_verified ON company_profiles(is_verified);
CREATE INDEX IF NOT EXISTS idx_company_profiles_company_name ON company_profiles(company_name);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_company_profiles_updated_at ON company_profiles;
CREATE TRIGGER update_company_profiles_updated_at BEFORE UPDATE ON company_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Investor Profiles Table
-- Stores investor profile information submitted by investors
CREATE TABLE IF NOT EXISTS investor_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Investor Information
  full_name VARCHAR(255),
  firm_size VARCHAR(100), -- e.g., "$10M - $50M"
  primary_markets VARCHAR(255), -- e.g., "Europe, USA"
  investment_focus VARCHAR(255), -- e.g., "SaaS, Healthcare"
  contact_number VARCHAR(50),
  
  -- Verification
  is_verified BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_investor_profiles_user_id ON investor_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_investor_profiles_is_verified ON investor_profiles(is_verified);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_investor_profiles_updated_at ON investor_profiles;
CREATE TRIGGER update_investor_profiles_updated_at BEFORE UPDATE ON investor_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Institutional Profiles Table
-- Stores detailed institutional information for investors
CREATE TABLE IF NOT EXISTS institutional_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Basic Information (Step 1)
  full_name VARCHAR(255),
  company_website VARCHAR(255),
  business_email VARCHAR(255),
  country_of_registration VARCHAR(100),
  company_fund_name VARCHAR(255),
  office_location_city VARCHAR(100),
  
  -- Investment Profile (Step 2)
  type_of_institution VARCHAR(100), -- e.g., "Private Equity", "Family Office", "Venture Fund"
  target_company_size VARCHAR(100), -- e.g., "€10–50M", "€50M+"
  assets_under_management VARCHAR(100), -- e.g., "€10–50M", "€50M+"
  preferred_regions VARCHAR(255), -- e.g., "Western Europe", "North America"
  typical_deal_ticket_size VARCHAR(100), -- e.g., "€5–20M", "€20M+"
  deal_stage_preference VARCHAR(50), -- e.g., "Minority", "Majority"
  sectors_of_interest VARCHAR(255), -- e.g., "Industrial", "Fintech", "Healthcare"
  
  -- Verification & Compliance (Step 3)
  fund_document_url TEXT, -- URL/path to uploaded PDF
  website_reference VARCHAR(255),
  additional_message TEXT,
  nda_consent BOOLEAN DEFAULT false,
  
  -- Verification
  is_verified BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_institutional_profiles_user_id ON institutional_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_institutional_profiles_is_verified ON institutional_profiles(is_verified);
CREATE INDEX IF NOT EXISTS idx_institutional_profiles_company_fund_name ON institutional_profiles(company_fund_name);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_institutional_profiles_updated_at ON institutional_profiles;
CREATE TRIGGER update_institutional_profiles_updated_at BEFORE UPDATE ON institutional_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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