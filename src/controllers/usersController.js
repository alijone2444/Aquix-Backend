const pool = require('../db');

/**
 * Get User Profile - Get current user's complete profile with all related data
 * Returns user info, roles, permissions, and profile data based on user type
 * - For investors: Returns institutional_profile and investor_profile
 * - For sellers: Returns company_profile
 */
const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRoles = req.user.roles.map(role => role.name);

    // Get complete user data with roles and permissions
    const userResult = await pool.query(
      `SELECT 
        u.id, u.full_name, u.email, u.company, u.is_active, u.rejection_reason,
        u.created_at, u.updated_at,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'id', r.id,
            'name', r.name,
            'description', r.description
          )) FILTER (WHERE r.id IS NOT NULL),
          '[]'
        ) as roles,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'resource', p.resource,
            'action', p.action
          )) FILTER (WHERE p.id IS NOT NULL),
          '[]'
        ) as permissions
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      LEFT JOIN role_permissions rp ON r.id = rp.role_id
      LEFT JOIN permissions p ON rp.permission_id = p.id
      WHERE u.id = $1
      GROUP BY u.id, u.full_name, u.email, u.company, u.is_active, u.rejection_reason, u.created_at, u.updated_at`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Initialize response structure
    const profileData = {
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        company: user.company,
        isActive: user.is_active,
        rejectionReason: user.rejection_reason ?? null,
        profileImageUrl: null, // Optional field - column doesn't exist yet
        createdAt: user.created_at,
        updatedAt: user.updated_at,
        roles: user.roles || [],
        permissions: user.permissions || []
      },
      investorProfile: null,
      institutionalProfile: null,
      companyProfile: null
    };

    // Fetch profiles based on user role
    if (userRoles.includes('investor')) {
      // Fetch institutional profile (required for investors)
      const institutionalProfileResult = await pool.query(
        'SELECT * FROM institutional_profiles WHERE user_id = $1',
        [userId]
      );

      if (institutionalProfileResult.rows.length > 0) {
        const inst = institutionalProfileResult.rows[0];
        profileData.institutionalProfile = {
          id: inst.id,
          userId: inst.user_id,
          fullName: inst.full_name,
          companyWebsite: inst.company_website,
          businessEmail: inst.business_email,
          countryOfRegistration: inst.country_of_registration,
          companyFundName: inst.company_fund_name,
          officeLocationCity: inst.office_location_city,
          typeOfInstitution: inst.type_of_institution,
          targetCompanySize: inst.target_company_size,
          assetsUnderManagement: inst.assets_under_management,
          preferredRegions: inst.preferred_regions,
          typicalDealTicketSize: inst.typical_deal_ticket_size,
          dealStagePreference: inst.deal_stage_preference,
          sectorsOfInterest: inst.sectors_of_interest,
          fundDocumentUrl: inst.fund_document_url,
          websiteReference: inst.website_reference,
          additionalMessage: inst.additional_message,
          ndaConsent: inst.nda_consent,
          isVerified: inst.is_verified,
          verifiedBy: inst.verified_by,
          verifiedAt: inst.verified_at,
          createdAt: inst.created_at,
          updatedAt: inst.updated_at
        };
      }

      // Fetch investor profile (optional for investors)
      const investorProfileResult = await pool.query(
        'SELECT * FROM investor_profiles WHERE user_id = $1',
        [userId]
      );

      if (investorProfileResult.rows.length > 0) {
        const inv = investorProfileResult.rows[0];
        profileData.investorProfile = {
          id: inv.id,
          userId: inv.user_id,
          fullName: inv.full_name,
          firmSize: inv.firm_size,
          primaryMarkets: inv.primary_markets,
          investmentFocus: inv.investment_focus,
          contactNumber: inv.contact_number,
          isVerified: inv.is_verified,
          verifiedBy: inv.verified_by,
          verifiedAt: inv.verified_at,
          createdAt: inv.created_at,
          updatedAt: inv.updated_at
        };
      }
    }

    if (userRoles.includes('seller')) {
      // Fetch company profile (required for sellers)
      const companyProfileResult = await pool.query(
        'SELECT * FROM company_profiles WHERE user_id = $1',
        [userId]
      );

      if (companyProfileResult.rows.length > 0) {
        const comp = companyProfileResult.rows[0];
        profileData.companyProfile = {
          id: comp.id,
          userId: comp.user_id,
          fullName: comp.full_name,
          position: comp.position,
          founderManagingDirector: comp.founder_managing_director,
          businessEmail: comp.business_email,
          companyName: comp.company_name,
          country: comp.country,
          phone: comp.phone,
          city: comp.city,
          yearFounded: comp.year_founded,
          legalForm: comp.legal_form,
          industrySector: comp.industry_sector,
          numberOfEmployees: comp.number_of_employees,
          annualRevenue: comp.annual_revenue,
          ebit: comp.ebit,
          currentYearEstimate: comp.current_year_estimate,
          currency: comp.currency,
          customerConcentrationPercent: comp.customer_concentration_percent,
          growthTrend: comp.growth_trend,
          ownershipStructure: comp.ownership_structure,
          founderSharesPercent: comp.founder_shares_percent,
          successionPlanned: comp.succession_planned,
          currentAdvisors: comp.current_advisors,
          interestedInSale: comp.interested_in_sale,
          dataUploadUrl: comp.data_upload_url,
          ndaConsent: comp.nda_consent,
          gdprConsent: comp.gdpr_consent,
          isVerified: comp.is_verified,
          verifiedBy: comp.verified_by,
          verifiedAt: comp.verified_at,
          createdAt: comp.created_at,
          updatedAt: comp.updated_at
        };
      }
    }

    res.json({
      success: true,
      data: profileData
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getUserProfile
};

