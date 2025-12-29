-- Test Data for Constants Table
-- Base EBIT Multiples by Industry/Sector
INSERT INTO constants (constant_type, constant_key, constant_value, description) VALUES
('BASE_EBIT_MULTIPLE', 'TECHNOLOGY', 12.5, 'Base EBIT Multiple for Technology sector'),
('BASE_EBIT_MULTIPLE', 'HEALTHCARE', 10.0, 'Base EBIT Multiple for Healthcare sector'),
('BASE_EBIT_MULTIPLE', 'FINANCIAL', 8.5, 'Base EBIT Multiple for Financial sector'),
('BASE_EBIT_MULTIPLE', 'MANUFACTURING', 7.0, 'Base EBIT Multiple for Manufacturing sector'),
('BASE_EBIT_MULTIPLE', 'RETAIL', 6.5, 'Base EBIT Multiple for Retail sector'),
('BASE_EBIT_MULTIPLE', 'ENERGY', 6.0, 'Base EBIT Multiple for Energy sector'),
('BASE_EBIT_MULTIPLE', 'REAL_ESTATE', 8.0, 'Base EBIT Multiple for Real Estate sector');

-- Country Risk Factors
INSERT INTO constants (constant_type, constant_key, constant_value, description) VALUES
('COUNTRY_RISK_FACTOR', 'US', 1.0, 'United States - Low risk'),
('COUNTRY_RISK_FACTOR', 'UK', 1.05, 'United Kingdom - Low risk'),
('COUNTRY_RISK_FACTOR', 'CA', 1.02, 'Canada - Low risk'),
('COUNTRY_RISK_FACTOR', 'DE', 1.03, 'Germany - Low risk'),
('COUNTRY_RISK_FACTOR', 'FR', 1.04, 'France - Low risk'),
('COUNTRY_RISK_FACTOR', 'AU', 1.03, 'Australia - Low risk'),
('COUNTRY_RISK_FACTOR', 'IN', 1.15, 'India - Medium risk'),
('COUNTRY_RISK_FACTOR', 'CN', 1.12, 'China - Medium risk'),
('COUNTRY_RISK_FACTOR', 'BR', 1.18, 'Brazil - Medium-High risk'),
('COUNTRY_RISK_FACTOR', 'MX', 1.14, 'Mexico - Medium risk');

-- Size Adjustment Factors (based on Annual Revenue)
INSERT INTO constants (constant_type, constant_key, constant_value, description) VALUES
('SIZE_ADJUSTMENT_FACTOR', 'MICRO', 0.7, 'Micro company (< $1M revenue)'),
('SIZE_ADJUSTMENT_FACTOR', 'SMALL', 0.85, 'Small company ($1M - $10M revenue)'),
('SIZE_ADJUSTMENT_FACTOR', 'MEDIUM', 1.0, 'Medium company ($10M - $50M revenue)'),
('SIZE_ADJUSTMENT_FACTOR', 'LARGE', 1.1, 'Large company ($50M - $250M revenue)'),
('SIZE_ADJUSTMENT_FACTOR', 'ENTERPRISE', 1.2, 'Enterprise (> $250M revenue)');

-- Customer Concentration Adjustment Factors
INSERT INTO constants (constant_type, constant_key, constant_value, description) VALUES
('CUSTOMER_CONCENTRATION_ADJUSTMENT', 'LOW', 1.0, 'Low concentration (< 20% from top 3 customers)'),
('CUSTOMER_CONCENTRATION_ADJUSTMENT', 'MEDIUM', 0.95, 'Medium concentration (20-40% from top 3 customers)'),
('CUSTOMER_CONCENTRATION_ADJUSTMENT', 'HIGH', 0.85, 'High concentration (40-60% from top 3 customers)'),
('CUSTOMER_CONCENTRATION_ADJUSTMENT', 'VERY_HIGH', 0.75, 'Very high concentration (> 60% from top 3 customers)');

-- Test Data for User Input Table
-- Note: Replace the constant IDs with actual IDs from your constants table after inserting constants above
-- You can find the IDs by running: SELECT id, constant_type, constant_key FROM constants;

-- Sample User Input 1: Technology company in US
INSERT INTO user_input (
  industry_sector, country_region, annual_revenue, ebit, currency,
  number_of_employees, top_3_customers_percent,
  base_ebit_multiple_id, country_risk_factor_id,
  size_adjustment_factor_id, customer_concentration_adjustment_id
) VALUES (
  'Technology', 'US', 50000000.00, 10000000.00, 'USD',
  250, 35.5,
  (SELECT id FROM constants WHERE constant_type = 'BASE_EBIT_MULTIPLE' AND constant_key = 'TECHNOLOGY'),
  (SELECT id FROM constants WHERE constant_type = 'COUNTRY_RISK_FACTOR' AND constant_key = 'US'),
  (SELECT id FROM constants WHERE constant_type = 'SIZE_ADJUSTMENT_FACTOR' AND constant_key = 'MEDIUM'),
  (SELECT id FROM constants WHERE constant_type = 'CUSTOMER_CONCENTRATION_ADJUSTMENT' AND constant_key = 'MEDIUM')
);

-- Sample User Input 2: Healthcare company in UK
INSERT INTO user_input (
  industry_sector, country_region, annual_revenue, ebit, currency,
  number_of_employees, top_3_customers_percent,
  base_ebit_multiple_id, country_risk_factor_id,
  size_adjustment_factor_id, customer_concentration_adjustment_id
) VALUES (
  'Healthcare', 'UK', 150000000.00, 30000000.00, 'GBP',
  500, 25.0,
  (SELECT id FROM constants WHERE constant_type = 'BASE_EBIT_MULTIPLE' AND constant_key = 'HEALTHCARE'),
  (SELECT id FROM constants WHERE constant_type = 'COUNTRY_RISK_FACTOR' AND constant_key = 'UK'),
  (SELECT id FROM constants WHERE constant_type = 'SIZE_ADJUSTMENT_FACTOR' AND constant_key = 'LARGE'),
  (SELECT id FROM constants WHERE constant_type = 'CUSTOMER_CONCENTRATION_ADJUSTMENT' AND constant_key = 'LOW')
);

-- Sample User Input 3: Manufacturing company in Germany
INSERT INTO user_input (
  industry_sector, country_region, annual_revenue, ebit, currency,
  number_of_employees, top_3_customers_percent,
  base_ebit_multiple_id, country_risk_factor_id,
  size_adjustment_factor_id, customer_concentration_adjustment_id
) VALUES (
  'Manufacturing', 'DE', 7500000.00, 1500000.00, 'EUR',
  85, 55.0,
  (SELECT id FROM constants WHERE constant_type = 'BASE_EBIT_MULTIPLE' AND constant_key = 'MANUFACTURING'),
  (SELECT id FROM constants WHERE constant_type = 'COUNTRY_RISK_FACTOR' AND constant_key = 'DE'),
  (SELECT id FROM constants WHERE constant_type = 'SIZE_ADJUSTMENT_FACTOR' AND constant_key = 'SMALL'),
  (SELECT id FROM constants WHERE constant_type = 'CUSTOMER_CONCENTRATION_ADJUSTMENT' AND constant_key = 'HIGH')
);

-- Sample User Input 4: Financial company in Canada (without optional fields)
INSERT INTO user_input (
  industry_sector, country_region, annual_revenue, ebit, currency,
  base_ebit_multiple_id, country_risk_factor_id,
  size_adjustment_factor_id
) VALUES (
  'Financial', 'CA', 300000000.00, 60000000.00, 'CAD',
  (SELECT id FROM constants WHERE constant_type = 'BASE_EBIT_MULTIPLE' AND constant_key = 'FINANCIAL'),
  (SELECT id FROM constants WHERE constant_type = 'COUNTRY_RISK_FACTOR' AND constant_key = 'CA'),
  (SELECT id FROM constants WHERE constant_type = 'SIZE_ADJUSTMENT_FACTOR' AND constant_key = 'ENTERPRISE')
);

-- Sample User Input 5: Retail company in India
INSERT INTO user_input (
  industry_sector, country_region, annual_revenue, ebit, currency,
  number_of_employees, top_3_customers_percent,
  base_ebit_multiple_id, country_risk_factor_id,
  size_adjustment_factor_id, customer_concentration_adjustment_id
) VALUES (
  'Retail', 'IN', 25000000.00, 5000000.00, 'INR',
  200, 45.5,
  (SELECT id FROM constants WHERE constant_type = 'BASE_EBIT_MULTIPLE' AND constant_key = 'RETAIL'),
  (SELECT id FROM constants WHERE constant_type = 'COUNTRY_RISK_FACTOR' AND constant_key = 'IN'),
  (SELECT id FROM constants WHERE constant_type = 'SIZE_ADJUSTMENT_FACTOR' AND constant_key = 'MEDIUM'),
  (SELECT id FROM constants WHERE constant_type = 'CUSTOMER_CONCENTRATION_ADJUSTMENT' AND constant_key = 'HIGH')
);

