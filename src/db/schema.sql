-- Constants Schema
-- Stores system-defined values like Base EBIT Multiple, Country Risk Factor, etc.

CREATE TABLE IF NOT EXISTS constants (
  id SERIAL PRIMARY KEY,
  constant_type VARCHAR(100) NOT NULL, -- e.g., 'BASE_EBIT_MULTIPLE', 'COUNTRY_RISK_FACTOR', 'SIZE_ADJUSTMENT_FACTOR', 'CUSTOMER_CONCENTRATION_ADJUSTMENT'
  constant_key VARCHAR(100) NOT NULL, -- e.g., country code, size category, industry code
  constant_value NUMERIC(15, 4) NOT NULL, -- The actual value
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(constant_type, constant_key)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_constants_type_key ON constants(constant_type, constant_key);

-- User Input Schema
-- Stores user-submitted data with references to constants

CREATE TABLE IF NOT EXISTS user_input (
  id SERIAL PRIMARY KEY,
  industry_sector VARCHAR(255) NOT NULL,
  country_region VARCHAR(100) NOT NULL,
  annual_revenue NUMERIC(20, 2) NOT NULL,
  ebit NUMERIC(20, 2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  number_of_employees INTEGER,
  top_3_customers_percent NUMERIC(5, 2),
  
  -- Foreign key references to constants
  base_ebit_multiple_id INTEGER REFERENCES constants(id),
  country_risk_factor_id INTEGER REFERENCES constants(id),
  size_adjustment_factor_id INTEGER REFERENCES constants(id),
  customer_concentration_adjustment_id INTEGER REFERENCES constants(id),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for foreign keys
CREATE INDEX IF NOT EXISTS idx_user_input_base_ebit_multiple ON user_input(base_ebit_multiple_id);
CREATE INDEX IF NOT EXISTS idx_user_input_country_risk_factor ON user_input(country_risk_factor_id);
CREATE INDEX IF NOT EXISTS idx_user_input_size_adjustment ON user_input(size_adjustment_factor_id);
CREATE INDEX IF NOT EXISTS idx_user_input_customer_concentration ON user_input(customer_concentration_adjustment_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to auto-update updated_at
DROP TRIGGER IF EXISTS update_constants_updated_at ON constants;
CREATE TRIGGER update_constants_updated_at BEFORE UPDATE ON constants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_input_updated_at ON user_input;
CREATE TRIGGER update_user_input_updated_at BEFORE UPDATE ON user_input
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- Company Constants Table (Mapped from specific Excel rows)
CREATE TABLE IF NOT EXISTS company_constants (
  id SERIAL PRIMARY KEY,
  company_name VARCHAR(255) NOT NULL,
  base NUMERIC(20, 4), -- Mapped from Norm EBIT
  country VARCHAR(100), -- Mapped from Country
  risk_factor NUMERIC(10, 4), -- Mapped from Country Risk Factor
  size NUMERIC(10, 4), -- Mapped from Dealability (Size) subscore
  adjustment_factor NUMERIC(10, 4), -- Mapped from Size Adjustment Factor
  customer NUMERIC(10, 4), -- Mapped from Top-3 %
  customer_concentration_adjustment NUMERIC(10, 4), -- Mapped from Customer Concentration Adjustment
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_company_constants_name ON company_constants(company_name);

-- Company Financial Data Table (Stores all metrics)
CREATE TABLE IF NOT EXISTS company_financial_data (
  id SERIAL PRIMARY KEY,
  company_name VARCHAR(255) NOT NULL,
  
  -- Core Info
  sector VARCHAR(255),
  country VARCHAR(100),
  currency VARCHAR(10),
  val_date DATE, 
  employees INTEGER,
  
  -- Revenue & EBIT History
  revenue_y1 NUMERIC(20, 2),
  revenue_y2 NUMERIC(20, 2),
  revenue_y3 NUMERIC(20, 2),
  ebit_y1 NUMERIC(20, 2),
  ebit_y2 NUMERIC(20, 2),
  ebit_y3 NUMERIC(20, 2),
  
  -- Forecast
  revenue_f1 NUMERIC(20, 2),
  revenue_f2 NUMERIC(20, 2),
  revenue_f3 NUMERIC(20, 2),
  ebit_f1 NUMERIC(20, 2),
  ebit_f2 NUMERIC(20, 2),
  ebit_f3 NUMERIC(20, 2),
  
  -- Balance Sheet
  total_debt NUMERIC(20, 2),
  current_assets NUMERIC(20, 2),
  current_liabilities NUMERIC(20, 2),
  
  -- Other Metrics
  credit_rating VARCHAR(50),
  ownership_percent NUMERIC(5, 2),
  mgmt_turnover_percent NUMERIC(5, 2),
  litigation TEXT, -- Yes/No
  top_3_percent NUMERIC(5, 2),
  founder_dep TEXT, -- Yes/No
  supplier_dep TEXT,
  staff_plan TEXT,
  audited TEXT,
  documentation TEXT,
  flexibility TEXT,
  timeline INTEGER,
  fx NUMERIC(10, 4),
  
  -- Calculated/Historical Averages
  rev_avg_historical NUMERIC(20, 2),
  ebit_avg_historical NUMERIC(20, 2),
  margin_percent NUMERIC(10, 2),
  ebit_cagr_percent NUMERIC(10, 2),
  volatility_percent NUMERIC(10, 2),
  rev_cagr_percent NUMERIC(10, 2),
  debt_ebitda NUMERIC(10, 2),
  current_ratio NUMERIC(10, 2),
  
  -- Factors (Also in Constants, but raw here maybe?)
  base_multiple_factor NUMERIC(10, 4),
  country_risk_factor NUMERIC(10, 4),
  size_adjustment_factor NUMERIC(10, 4),
  customer_concentration_adjustment NUMERIC(10, 4),
  
  -- Valuation Outputs
  adj_mult NUMERIC(10, 4),
  norm_ebit NUMERIC(20, 2),
  ev_mid NUMERIC(20, 2),
  ev_low NUMERIC(20, 2),
  ev_high NUMERIC(20, 2),
  
  -- Qualitative/Scores
  financial_strength VARCHAR(100),
  risk_management VARCHAR(100),
  market_context VARCHAR(100),
  
  dealability_size_subscore NUMERIC(10, 2),
  dealability_documentation_subscore NUMERIC(10, 2),
  dealability_flexibility_subscore NUMERIC(10, 2),
  dealability_timeline_subscore NUMERIC(10, 2),
  dealability_score NUMERIC(10, 2),
  
  -- Additional Scores (from training datasets)
  financial_quality NUMERIC(10, 2),
  growth_score NUMERIC(10, 2),
  data_completeness NUMERIC(10, 2),
  sector_context NUMERIC(10, 2),
  investment_attractiveness NUMERIC(10, 2),
  tapway_score NUMERIC(10, 2),
  valuation_range_low_percent NUMERIC(10, 2),
  valuation_range_high_percent NUMERIC(10, 2),
  
  valuation_reliability VARCHAR(100),
  fx_confidence VARCHAR(100),
  peer_gap_percent NUMERIC(10, 2),
  age_warning VARCHAR(255),
  inst_bonus NUMERIC(10, 2),
  risk_flags TEXT,
  tapway_institutional_score NUMERIC(10, 2),
  narrative TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_company_financial_data_name ON company_financial_data(company_name);

-- Triggers for new tables
DROP TRIGGER IF EXISTS update_company_constants_updated_at ON company_constants;
CREATE TRIGGER update_company_constants_updated_at BEFORE UPDATE ON company_constants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_company_financial_updated_at ON company_financial_data;
CREATE TRIGGER update_company_financial_updated_at BEFORE UPDATE ON company_financial_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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
