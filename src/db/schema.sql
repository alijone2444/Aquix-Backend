

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

CREATE TABLE constant_sector_metrics (
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
    band_min DECIMAL(10, 2)               -- e.g., 10.00
);

CREATE TABLE constant_country_adjustments (
    country_code CHAR(2) PRIMARY KEY, -- e.g., 'US', 'DE'
    delta_multiple DECIMAL(5, 2)      -- e.g., 0.20, -0.30
);

CREATE TABLE constant_size_adjustments (
    rev_min_eur BIGINT PRIMARY KEY,  -- Using BIGINT for large currency numbers
    delta_multiple DECIMAL(5, 2)     -- e.g., -0.50, 0.60
);

CREATE TABLE constant_concentration_adjustments (
    top3_min_pct INT PRIMARY KEY,    -- e.g., 30, 45
    delta_multiple DECIMAL(5, 2)     -- e.g., -0.30, 0.10
);

CREATE TABLE constant_fx_rates (
    currency_code CHAR(3) PRIMARY KEY, -- e.g., 'USD', 'GBP'
    rate_to_eur DECIMAL(10, 4)         -- e.g., 1.1700 (4 decimals for precision)
);

CREATE TABLE constant_deal_size_scores (
    ev_min_eur BIGINT PRIMARY KEY,
    size_score INT                     -- e.g., 40, 60, 95
);

CREATE TABLE constant_credit_ratings (
    rating VARCHAR(10) PRIMARY KEY,   -- e.g., 'AAA', 'BBB-'
    score INT                         -- e.g., 98, 84
);

CREATE TABLE company_valuation_models (
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
    val_ev_low_eur VARCHAR(50),           -- "74,606k EUR"
    val_ev_mid_eur VARCHAR(50),           -- "87,772k EUR"
    val_ev_high_eur VARCHAR(50),          -- "100,938k EUR"

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
