const pool = require('../db');

/**
 * Helper utility to look up constant IDs based on business logic
 * This can be used to automatically find the right constant IDs when creating user input
 */

/**
 * Determine size category based on annual revenue
 */
function getSizeCategory(annualRevenue) {
  if (annualRevenue < 1000000) return 'MICRO';
  if (annualRevenue < 10000000) return 'SMALL';
  if (annualRevenue < 50000000) return 'MEDIUM';
  if (annualRevenue < 250000000) return 'LARGE';
  return 'ENTERPRISE';
}

/**
 * Determine customer concentration category based on top 3 customers percentage
 */
function getCustomerConcentrationCategory(top3CustomersPercent) {
  if (!top3CustomersPercent) return 'LOW';
  if (top3CustomersPercent < 20) return 'LOW';
  if (top3CustomersPercent < 40) return 'MEDIUM';
  if (top3CustomersPercent < 60) return 'HIGH';
  return 'VERY_HIGH';
}

/**
 * Look up constant ID by type and key
 */
async function lookupConstantId(constantType, constantKey) {
  try {
    const result = await pool.query(
      'SELECT id FROM constants WHERE constant_type = $1 AND constant_key = $2',
      [constantType, constantKey]
    );
    return result.rows.length > 0 ? result.rows[0].id : null;
  } catch (error) {
    console.error('Error looking up constant:', error);
    return null;
  }
}

/**
 * Automatically find constant IDs for user input based on business rules
 * This is a helper that can be used when creating user input to automatically
 * find the appropriate constant references
 */
async function findConstantsForUserInput(userInputData) {
  const {
    industry_sector,
    country_region,
    annual_revenue,
    top_3_customers_percent
  } = userInputData;

  const constants = {};

  // Find Base EBIT Multiple (based on industry/sector)
  if (industry_sector) {
    const industryKey = industry_sector.toUpperCase().replace(/\s+/g, '_');
    constants.base_ebit_multiple_id = await lookupConstantId('BASE_EBIT_MULTIPLE', industryKey);
  }

  // Find Country Risk Factor (based on country/region)
  if (country_region) {
    const countryKey = country_region.toUpperCase();
    constants.country_risk_factor_id = await lookupConstantId('COUNTRY_RISK_FACTOR', countryKey);
  }

  // Find Size Adjustment Factor (based on annual revenue)
  if (annual_revenue !== undefined) {
    const sizeCategory = getSizeCategory(annual_revenue);
    constants.size_adjustment_factor_id = await lookupConstantId('SIZE_ADJUSTMENT_FACTOR', sizeCategory);
  }

  // Find Customer Concentration Adjustment (based on top 3 customers %)
  if (top_3_customers_percent !== undefined) {
    const concentrationCategory = getCustomerConcentrationCategory(top_3_customers_percent);
    constants.customer_concentration_adjustment_id = await lookupConstantId(
      'CUSTOMER_CONCENTRATION_ADJUSTMENT',
      concentrationCategory
    );
  }

  return constants;
}

module.exports = {
  getSizeCategory,
  getCustomerConcentrationCategory,
  lookupConstantId,
  findConstantsForUserInput
};

