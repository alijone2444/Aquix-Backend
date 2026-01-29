const pool = require('../db');

/**
 * Get all investors and sellers who have linked profiles
 * Combines user data with profile data into single objects
 */
const getUserManagement = async (req, res) => {
  try {
    // Fetch all investors who have investor_profiles
    const investorsResult = await pool.query(
      `SELECT 
        ip.*,
        u.id as user_id,
        u.full_name as user_full_name,
        u.email as user_email,
        u.company as user_company,
        u.is_active as user_is_active,
        u.created_at as user_created_at,
        u.updated_at as user_updated_at
      FROM investor_profiles ip
      JOIN users u ON ip.user_id = u.id
      ORDER BY ip.created_at DESC`
    );

    // Fetch all institutional investors who have institutional_profiles
    const institutionalInvestorsResult = await pool.query(
      `SELECT 
        inst.*,
        u.id as user_id,
        u.full_name as user_full_name,
        u.email as user_email,
        u.company as user_company,
        u.is_active as user_is_active,
        u.created_at as user_created_at,
        u.updated_at as user_updated_at
      FROM institutional_profiles inst
      JOIN users u ON inst.user_id = u.id
      ORDER BY inst.created_at DESC`
    );

    // Fetch all sellers who have company_profiles
    const sellersResult = await pool.query(
      `SELECT 
        cp.*,
        u.id as user_id,
        u.full_name as user_full_name,
        u.email as user_email,
        u.company as user_company,
        u.is_active as user_is_active,
        u.created_at as user_created_at,
        u.updated_at as user_updated_at
      FROM company_profiles cp
      JOIN users u ON cp.user_id = u.id
      ORDER BY cp.created_at DESC`
    );

    // Create a map to combine investors with their profiles
    const investorsMap = new Map();

    // Process investor_profiles
    investorsResult.rows.forEach(row => {
      const userId = row.user_id;
      
      if (!investorsMap.has(userId)) {
        investorsMap.set(userId, {
          user: {
            id: row.user_id,
            fullName: row.user_full_name,
            email: row.user_email,
            company: row.user_company,
            isActive: row.user_is_active,
            profileImageUrl: null, // Optional field - column doesn't exist yet
            createdAt: row.user_created_at,
            updatedAt: row.user_updated_at
          },
          investorProfile: null,
          institutionalProfile: null
        });
      }

      investorsMap.get(userId).investorProfile = {
        id: row.id,
        userId: row.user_id,
        fullName: row.full_name,
        firmSize: row.firm_size,
        primaryMarkets: row.primary_markets,
        investmentFocus: row.investment_focus,
        contactNumber: row.contact_number,
        isVerified: row.is_verified,
        verifiedBy: row.verified_by,
        verifiedAt: row.verified_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });

    // Process institutional_profiles and merge with existing investors
    institutionalInvestorsResult.rows.forEach(row => {
      const userId = row.user_id;
      
      if (!investorsMap.has(userId)) {
        investorsMap.set(userId, {
          user: {
            id: row.user_id,
            fullName: row.user_full_name,
            email: row.user_email,
            company: row.user_company,
            isActive: row.user_is_active,
            profileImageUrl: null, // Optional field - column doesn't exist yet
            createdAt: row.user_created_at,
            updatedAt: row.user_updated_at
          },
          investorProfile: null,
          institutionalProfile: null
        });
      }

      investorsMap.get(userId).institutionalProfile = {
        id: row.id,
        userId: row.user_id,
        fullName: row.full_name,
        companyWebsite: row.company_website,
        businessEmail: row.business_email,
        countryOfRegistration: row.country_of_registration,
        companyFundName: row.company_fund_name,
        officeLocationCity: row.office_location_city,
        typeOfInstitution: row.type_of_institution,
        targetCompanySize: row.target_company_size,
        assetsUnderManagement: row.assets_under_management,
        preferredRegions: row.preferred_regions,
        typicalDealTicketSize: row.typical_deal_ticket_size,
        dealStagePreference: row.deal_stage_preference,
        sectorsOfInterest: row.sectors_of_interest,
        fundDocumentUrl: row.fund_document_url,
        websiteReference: row.website_reference,
        additionalMessage: row.additional_message,
        ndaConsent: row.nda_consent,
        isVerified: row.is_verified,
        verifiedBy: row.verified_by,
        verifiedAt: row.verified_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });

    // Convert map to array
    const investors = Array.from(investorsMap.values());

    // Combine user and profile data for sellers
    const sellers = sellersResult.rows.map(row => {
      const user = {
        id: row.user_id,
        fullName: row.user_full_name,
        email: row.user_email,
        company: row.user_company,
        isActive: row.user_is_active,
        profileImageUrl: null, // Optional field - column doesn't exist yet
        createdAt: row.user_created_at,
        updatedAt: row.user_updated_at
      };

      const companyProfile = {
        id: row.id,
        userId: row.user_id,
        fullName: row.full_name,
        position: row.position,
        founderManagingDirector: row.founder_managing_director,
        businessEmail: row.business_email,
        companyName: row.company_name,
        country: row.country,
        phone: row.phone,
        city: row.city,
        yearFounded: row.year_founded,
        legalForm: row.legal_form,
        industrySector: row.industry_sector,
        numberOfEmployees: row.number_of_employees,
        annualRevenue: row.annual_revenue,
        ebit: row.ebit,
        currentYearEstimate: row.current_year_estimate,
        currency: row.currency,
        customerConcentrationPercent: row.customer_concentration_percent,
        growthTrend: row.growth_trend,
        ownershipStructure: row.ownership_structure,
        founderSharesPercent: row.founder_shares_percent,
        successionPlanned: row.succession_planned,
        currentAdvisors: row.current_advisors,
        interestedInSale: row.interested_in_sale,
        dataUploadUrl: row.data_upload_url,
        ndaConsent: row.nda_consent,
        gdprConsent: row.gdpr_consent,
        isVerified: row.is_verified,
        verifiedBy: row.verified_by,
        verifiedAt: row.verified_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };

      return {
        user,
        companyProfile
      };
    });

    res.json({
      success: true,
      data: {
        investors,
        sellers
      },
      counts: {
        investors: investors.length,
        sellers: sellers.length,
        total: investors.length + sellers.length
      }
    });
  } catch (error) {
    console.error('User management error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get all investors with unverified profiles (investorProfile and/or institutionalProfile)
 * Returns only investors whose profiles are NOT verified (is_verified = false)
 */
const getInvestors = async (req, res) => {
  try {
    // Fetch investors who have unverified investor_profiles
    const investorsResult = await pool.query(
      `SELECT 
        ip.*,
        u.id as user_id,
        u.full_name as user_full_name,
        u.email as user_email,
        u.company as user_company,
        u.is_active as user_is_active,
        u.created_at as user_created_at,
        u.updated_at as user_updated_at
      FROM investor_profiles ip
      JOIN users u ON ip.user_id = u.id
      WHERE ip.is_verified = false
      ORDER BY ip.created_at DESC`
    );

    // Fetch investors who have unverified institutional_profiles
    const institutionalInvestorsResult = await pool.query(
      `SELECT 
        inst.*,
        u.id as user_id,
        u.full_name as user_full_name,
        u.email as user_email,
        u.company as user_company,
        u.is_active as user_is_active,
        u.created_at as user_created_at,
        u.updated_at as user_updated_at
      FROM institutional_profiles inst
      JOIN users u ON inst.user_id = u.id
      WHERE inst.is_verified = false
      ORDER BY inst.created_at DESC`
    );

    // Create a map to combine investors with their profiles
    const investorsMap = new Map();

    // Process investor_profiles (only unverified)
    investorsResult.rows.forEach(row => {
      const userId = row.user_id;
      
      if (!investorsMap.has(userId)) {
        investorsMap.set(userId, {
          user: {
            id: row.user_id,
            fullName: row.user_full_name,
            email: row.user_email,
            company: row.user_company,
            isActive: row.user_is_active,
            profileImageUrl: null, // Optional field - column doesn't exist yet
            createdAt: row.user_created_at,
            updatedAt: row.user_updated_at
          },
          investorProfile: null,
          institutionalProfile: null
        });
      }

      investorsMap.get(userId).investorProfile = {
        id: row.id,
        userId: row.user_id,
        fullName: row.full_name,
        firmSize: row.firm_size,
        primaryMarkets: row.primary_markets,
        investmentFocus: row.investment_focus,
        contactNumber: row.contact_number,
        isVerified: row.is_verified,
        verifiedBy: row.verified_by,
        verifiedAt: row.verified_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });

    // Process institutional_profiles (only unverified) and merge with existing investors
    institutionalInvestorsResult.rows.forEach(row => {
      const userId = row.user_id;
      
      if (!investorsMap.has(userId)) {
        investorsMap.set(userId, {
          user: {
            id: row.user_id,
            fullName: row.user_full_name,
            email: row.user_email,
            company: row.user_company,
            isActive: row.user_is_active,
            profileImageUrl: null, // Optional field - column doesn't exist yet
            createdAt: row.user_created_at,
            updatedAt: row.user_updated_at
          },
          investorProfile: null,
          institutionalProfile: null
        });
      }

      investorsMap.get(userId).institutionalProfile = {
        id: row.id,
        userId: row.user_id,
        fullName: row.full_name,
        companyWebsite: row.company_website,
        businessEmail: row.business_email,
        countryOfRegistration: row.country_of_registration,
        companyFundName: row.company_fund_name,
        officeLocationCity: row.office_location_city,
        typeOfInstitution: row.type_of_institution,
        targetCompanySize: row.target_company_size,
        assetsUnderManagement: row.assets_under_management,
        preferredRegions: row.preferred_regions,
        typicalDealTicketSize: row.typical_deal_ticket_size,
        dealStagePreference: row.deal_stage_preference,
        sectorsOfInterest: row.sectors_of_interest,
        fundDocumentUrl: row.fund_document_url,
        websiteReference: row.website_reference,
        additionalMessage: row.additional_message,
        ndaConsent: row.nda_consent,
        isVerified: row.is_verified,
        verifiedBy: row.verified_by,
        verifiedAt: row.verified_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });

    // Convert map to array - only include investors who have at least one unverified profile
    const investors = Array.from(investorsMap.values());

    res.json({
      success: true,
      data: {
        investors
      },
      count: investors.length
    });
  } catch (error) {
    console.error('Get investors error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getUserManagement,
  getInvestors
};

