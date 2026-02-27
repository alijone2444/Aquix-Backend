const pool = require('../db');

/**
 * Get Company Profiles (Investment Opportunities)
 * Returns verified sellers' company profiles with NDA consent for the investor dashboard.
 * Only companies where nda_consent = true are returned.
 */
const getCompanyProfiles = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        cp.id,
        cp.user_id,
        cp.full_name,
        cp.position,
        cp.founder_managing_director,
        cp.business_email,
        cp.company_name,
        cp.country,
        cp.phone,
        cp.city,
        cp.year_founded,
        cp.legal_form,
        cp.industry_sector,
        cp.number_of_employees,
        cp.annual_revenue,
        cp.ebit,
        cp.current_year_estimate,
        cp.currency,
        cp.customer_concentration_percent,
        cp.growth_trend,
        cp.ownership_structure,
        cp.founder_shares_percent,
        cp.succession_planned,
        cp.current_advisors,
        cp.interested_in_sale,
        cp.data_upload_url,
        cp.is_verified,
        cp.verified_at,
        cp.created_at,
        cp.updated_at
      FROM company_profiles cp
      JOIN users u ON cp.user_id = u.id
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.name = 'seller' AND cp.is_verified = true AND cp.nda_consent = true
      ORDER BY cp.updated_at DESC, cp.created_at DESC`
    );

    const companies = result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      companyName: row.company_name,
      industry: row.industry_sector,
      location: row.country,
      city: row.city,
      fullName: row.full_name,
      position: row.position,
      businessEmail: row.business_email,
      phone: row.phone,
      yearFounded: row.year_founded,
      legalForm: row.legal_form,
      numberOfEmployees: row.number_of_employees,
      annualRevenue: row.annual_revenue,
      ebit: row.ebit,
      currentYearEstimate: row.current_year_estimate,
      currency: row.currency || 'USD',
      customerConcentrationPercent: row.customer_concentration_percent,
      growthTrend: row.growth_trend,
      ownershipStructure: row.ownership_structure,
      founderSharesPercent: row.founder_shares_percent,
      successionPlanned: row.succession_planned,
      currentAdvisors: row.current_advisors,
      interestedInSale: row.interested_in_sale,
      dataUploadUrl: row.data_upload_url,
      isVerified: row.is_verified,
      verifiedAt: row.verified_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // UI-friendly fields for investment opportunity cards (extend when you add ESG, level, valuation, score)
      description: row.growth_trend || row.industry_sector
        ? `${row.industry_sector || 'Company'}${row.growth_trend ? ` • ${row.growth_trend}` : ''}.`
        : null,
      companyLogoUrl: null,
      esgTag: null,
      investmentLevel: null,
      revenueRange: row.annual_revenue != null ? formatRevenueRange(row.annual_revenue, row.currency) : null,
      ebitRange: row.ebit != null ? formatRevenueRange(row.ebit, row.currency) : null,
      valuationRange: null,
      acquisitionScore: null,
    }));

    res.json({
      success: true,
      data: {
        companies,
      },
      count: companies.length,
    });
  } catch (error) {
    console.error('Get company profiles (investor) error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

function formatRevenueRange(value, currency) {
  const num = Number(value);
  if (isNaN(num)) return null;
  const code = (currency || 'USD').toUpperCase();
  if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(0)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
  return `${code} ${num}`;
}

module.exports = {
  getCompanyProfiles,
};
