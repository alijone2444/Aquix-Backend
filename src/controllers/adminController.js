const pool = require('../db');

/**
 * Get all investors and sellers with their profiles
 * Includes users without profiles and inactive users (OTP not verified)
 * Combines user data with profile data into single objects
 */
const getUserManagement = async (req, res) => {
  try {
    // Fetch all users with investor role (including inactive and without profiles)
    const investorsUsersResult = await pool.query(
      `SELECT DISTINCT
        u.id as user_id,
        u.full_name as user_full_name,
        u.email as user_email,
        u.company as user_company,
        u.is_active as user_is_active,
        u.created_at as user_created_at,
        u.updated_at as user_updated_at
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.name = 'investor'
      ORDER BY u.created_at DESC`
    );

    // Fetch all users with seller role (including inactive and without profiles)
    const sellersUsersResult = await pool.query(
      `SELECT DISTINCT
        u.id as user_id,
        u.full_name as user_full_name,
        u.email as user_email,
        u.company as user_company,
        u.is_active as user_is_active,
        u.created_at as user_created_at,
        u.updated_at as user_updated_at
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.name = 'seller'
      ORDER BY u.created_at DESC`
    );

    // Fetch all investor_profiles
    const investorsProfilesResult = await pool.query(
      `SELECT * FROM investor_profiles ORDER BY created_at DESC`
    );

    // Fetch all institutional_profiles
    const institutionalProfilesResult = await pool.query(
      `SELECT * FROM institutional_profiles ORDER BY created_at DESC`
    );

    // Fetch all company_profiles
    const sellersProfilesResult = await pool.query(
      `SELECT * FROM company_profiles ORDER BY created_at DESC`
    );

    // Create maps to store profiles by user_id
    const investorProfilesMap = new Map();
    const institutionalProfilesMap = new Map();
    const companyProfilesMap = new Map();

    // Map investor_profiles by user_id
    investorsProfilesResult.rows.forEach(profile => {
      investorProfilesMap.set(profile.user_id, {
        id: profile.id,
        userId: profile.user_id,
        fullName: profile.full_name,
        firmSize: profile.firm_size,
        primaryMarkets: profile.primary_markets,
        investmentFocus: profile.investment_focus,
        contactNumber: profile.contact_number,
        isVerified: profile.is_verified,
        verifiedBy: profile.verified_by,
        verifiedAt: profile.verified_at,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at
      });
    });

    // Map institutional_profiles by user_id
    institutionalProfilesResult.rows.forEach(profile => {
      institutionalProfilesMap.set(profile.user_id, {
        id: profile.id,
        userId: profile.user_id,
        fullName: profile.full_name,
        companyWebsite: profile.company_website,
        businessEmail: profile.business_email,
        countryOfRegistration: profile.country_of_registration,
        companyFundName: profile.company_fund_name,
        officeLocationCity: profile.office_location_city,
        typeOfInstitution: profile.type_of_institution,
        targetCompanySize: profile.target_company_size,
        assetsUnderManagement: profile.assets_under_management,
        preferredRegions: profile.preferred_regions,
        typicalDealTicketSize: profile.typical_deal_ticket_size,
        dealStagePreference: profile.deal_stage_preference,
        sectorsOfInterest: profile.sectors_of_interest,
        fundDocumentUrl: profile.fund_document_url,
        websiteReference: profile.website_reference,
        additionalMessage: profile.additional_message,
        ndaConsent: profile.nda_consent,
        isVerified: profile.is_verified,
        verifiedBy: profile.verified_by,
        verifiedAt: profile.verified_at,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at
      });
    });

    // Map company_profiles by user_id
    sellersProfilesResult.rows.forEach(profile => {
      companyProfilesMap.set(profile.user_id, {
        id: profile.id,
        userId: profile.user_id,
        fullName: profile.full_name,
        position: profile.position,
        founderManagingDirector: profile.founder_managing_director,
        businessEmail: profile.business_email,
        companyName: profile.company_name,
        country: profile.country,
        phone: profile.phone,
        city: profile.city,
        yearFounded: profile.year_founded,
        legalForm: profile.legal_form,
        industrySector: profile.industry_sector,
        numberOfEmployees: profile.number_of_employees,
        annualRevenue: profile.annual_revenue,
        ebit: profile.ebit,
        currentYearEstimate: profile.current_year_estimate,
        currency: profile.currency,
        customerConcentrationPercent: profile.customer_concentration_percent,
        growthTrend: profile.growth_trend,
        ownershipStructure: profile.ownership_structure,
        founderSharesPercent: profile.founder_shares_percent,
        successionPlanned: profile.succession_planned,
        currentAdvisors: profile.current_advisors,
        interestedInSale: profile.interested_in_sale,
        dataUploadUrl: profile.data_upload_url,
        ndaConsent: profile.nda_consent,
        gdprConsent: profile.gdpr_consent,
        isVerified: profile.is_verified,
        verifiedBy: profile.verified_by,
        verifiedAt: profile.verified_at,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at
      });
    });

    // Combine investors with their profiles
    const investors = investorsUsersResult.rows.map(row => {
      return {
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
        investorProfile: investorProfilesMap.get(row.user_id) || null,
        institutionalProfile: institutionalProfilesMap.get(row.user_id) || null
      };
    });

    // Combine sellers with their profiles
    const sellers = sellersUsersResult.rows.map(row => {
      return {
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
        companyProfile: companyProfilesMap.get(row.user_id) || null
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
 * Get all investors with complete data (institutional profiles)
 * Returns investors who have institutional profiles (complete data) regardless of verification status
 * This includes both investor profiles and institutional profiles for processing on frontend
 */
const getInvestors = async (req, res) => {
  try {
    // Fetch all investors who have institutional profiles (complete data)
    // This is the main requirement - investors must have institutional profiles
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
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.name = 'investor'
      ORDER BY inst.created_at DESC`
    );

    // Get user IDs of investors with institutional profiles
    const investorUserIds = institutionalInvestorsResult.rows.map(row => row.user_id);

    // Fetch investor_profiles for these users (if they exist)
    let investorsProfilesResult = { rows: [] };
    if (investorUserIds.length > 0) {
      investorsProfilesResult = await pool.query(
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
        WHERE ip.user_id = ANY($1::uuid[])
        ORDER BY ip.created_at DESC`,
        [investorUserIds]
      );
    }

    // Create a map to combine investors with their profiles
    const investorsMap = new Map();

    // Process institutional_profiles first (these are required - complete data)
    institutionalInvestorsResult.rows.forEach(row => {
      const userId = row.user_id;
      
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
        institutionalProfile: {
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
        }
      });
    });

    // Process investor_profiles and merge with existing investors
    investorsProfilesResult.rows.forEach(row => {
      const userId = row.user_id;
      
      if (investorsMap.has(userId)) {
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
      }
    });

    // Convert map to array - only investors with institutional profiles (complete data)
    const investors = Array.from(investorsMap.values());

    res.json({
      success: true,
      data: {
        investors
      },
      count: investors.length,
      message: 'Returns all investors with complete data (institutional profiles)'
    });
  } catch (error) {
    console.error('Get investors error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Delete User - Delete a user (investor, seller, or admin) and all linked data
 * This will delete:
 * - User record
 * - User roles
 * - OTPs
 * - Company profiles (for sellers)
 * - Investor profiles (for investors)
 * - Institutional profiles (for investors)
 * - All references in verified_by, assigned_by, granted_by fields
 */
const deleteUser = async (req, res) => {
  try {
    const { userId, userType } = req.body;

    // Validate required fields
    if (!userId) {
      return res.status(400).json({ 
        error: 'userId is required' 
      });
    }

    if (!userType) {
      return res.status(400).json({ 
        error: 'userType is required. Must be one of: investor, seller, admin' 
      });
    }

    // Validate userType
    const validUserTypes = ['investor', 'seller', 'admin'];
    if (!validUserTypes.includes(userType.toLowerCase())) {
      return res.status(400).json({ 
        error: 'Invalid userType. Must be one of: investor, seller, admin' 
      });
    }

    // Check if user exists
    const userResult = await pool.query(
      'SELECT id, email, full_name FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify user has the expected role (optional validation)
    const userRolesResult = await pool.query(
      `SELECT r.name 
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = $1`,
      [userId]
    );

    const userRoles = userRolesResult.rows.map(row => row.name);
    const expectedRole = userType.toLowerCase();

    // Warn if user doesn't have the expected role, but proceed anyway
    if (!userRoles.includes(expectedRole)) {
      console.warn(`User ${userId} does not have ${expectedRole} role. Current roles: ${userRoles.join(', ')}`);
    }

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Step 1: Set verified_by, assigned_by, granted_by to NULL where they reference this user
      // This prevents foreign key constraint violations
      
      // Update company_profiles.verified_by
      await pool.query(
        'UPDATE company_profiles SET verified_by = NULL WHERE verified_by = $1',
        [userId]
      );

      // Update investor_profiles.verified_by
      await pool.query(
        'UPDATE investor_profiles SET verified_by = NULL WHERE verified_by = $1',
        [userId]
      );

      // Update institutional_profiles.verified_by
      await pool.query(
        'UPDATE institutional_profiles SET verified_by = NULL WHERE verified_by = $1',
        [userId]
      );

      // Update user_roles.assigned_by
      await pool.query(
        'UPDATE user_roles SET assigned_by = NULL WHERE assigned_by = $1',
        [userId]
      );

      // Update role_permissions.granted_by
      await pool.query(
        'UPDATE role_permissions SET granted_by = NULL WHERE granted_by = $1',
        [userId]
      );

      // Step 2: Delete user (this will cascade delete):
      // - user_roles (ON DELETE CASCADE)
      // - otps (ON DELETE CASCADE)
      // - company_profiles (ON DELETE CASCADE)
      // - investor_profiles (ON DELETE CASCADE)
      // - institutional_profiles (ON DELETE CASCADE)
      const deleteResult = await pool.query(
        'DELETE FROM users WHERE id = $1 RETURNING id, email, full_name',
        [userId]
      );

      if (deleteResult.rows.length === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }

      await pool.query('COMMIT');

      res.json({
        success: true,
        message: `${userType} deleted successfully`,
        deletedUser: {
          id: deleteResult.rows[0].id,
          email: deleteResult.rows[0].email,
          fullName: deleteResult.rows[0].full_name,
          userType: expectedRole
        }
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Bulk Approve/Deny Investors - Approve or deny multiple investors' profiles
 * Accepts an array of user IDs with actions (true = approve, false = deny)
 * Updates both investor_profiles and institutional_profiles
 * Body: { approvals: [{ userId: UUID, action: boolean }, ...] }
 */
const bulkApproveInvestors = async (req, res) => {
  try {
    const { approvals } = req.body;

    // Validate input
    if (!approvals || !Array.isArray(approvals) || approvals.length === 0) {
      return res.status(400).json({ 
        error: 'approvals array is required and must not be empty' 
      });
    }

    // Validate each approval object
    for (const approval of approvals) {
      if (!approval.userId) {
        return res.status(400).json({ 
          error: 'Each approval must have a userId field' 
        });
      }
      
      // Convert action to boolean (handle 1/0, true/false, "true"/"false")
      if (approval.action === undefined || approval.action === null) {
        return res.status(400).json({ 
          error: 'Each approval must have an action field (true/false or 1/0)' 
        });
      }
    }

    const verifierId = req.user.id;
    const results = {
      successful: [],
      failed: [],
      notFound: []
    };

    // Start transaction
    await pool.query('BEGIN');

    try {
      for (const approval of approvals) {
        const { userId, action } = approval;
        
        // Convert action to boolean (handle 1/0, true/false, "true"/"false")
        const isVerified = action === true || action === 1 || action === 'true' || action === '1';
        
        try {
          // Update institutional_profiles (required for investors with complete data)
          const institutionalUpdateResult = await pool.query(
            `UPDATE institutional_profiles 
             SET is_verified = $1, 
                 verified_by = $2,
                 verified_at = CASE WHEN $1 = true THEN NOW() ELSE NULL END
             WHERE user_id = $3
             RETURNING id, user_id, is_verified`,
            [isVerified, verifierId, userId]
          );

          // Update investor_profiles (if exists)
          const investorUpdateResult = await pool.query(
            `UPDATE investor_profiles 
             SET is_verified = $1, 
                 verified_by = $2,
                 verified_at = CASE WHEN $1 = true THEN NOW() ELSE NULL END
             WHERE user_id = $3
             RETURNING id, user_id, is_verified`,
            [isVerified, verifierId, userId]
          );

          // Check if at least one profile was updated
          if (institutionalUpdateResult.rows.length === 0 && investorUpdateResult.rows.length === 0) {
            results.notFound.push({
              userId,
              action: isVerified,
              reason: 'No profiles found for this user'
            });
          } else {
            results.successful.push({
              userId,
              action: isVerified,
              institutionalProfileUpdated: institutionalUpdateResult.rows.length > 0,
              investorProfileUpdated: investorUpdateResult.rows.length > 0
            });
          }
        } catch (error) {
          console.error(`Error updating profiles for user ${userId}:`, error);
          results.failed.push({
            userId,
            action: isVerified,
            error: error.message
          });
        }
      }

      await pool.query('COMMIT');

      res.json({
        success: true,
        message: `Processed ${approvals.length} approval(s)`,
        results: {
          total: approvals.length,
          successful: results.successful.length,
          failed: results.failed.length,
          notFound: results.notFound.length,
          details: {
            successful: results.successful,
            failed: results.failed,
            notFound: results.notFound
          }
        }
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Bulk approve investors error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getUserManagement,
  getInvestors,
  deleteUser,
  bulkApproveInvestors
};

