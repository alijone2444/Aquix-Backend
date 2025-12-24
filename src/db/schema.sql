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
CREATE TRIGGER update_constants_updated_at BEFORE UPDATE ON constants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_input_updated_at BEFORE UPDATE ON user_input
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

