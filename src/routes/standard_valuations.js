const express = require('express');
const router = express.Router();
const pool = require('../db');


// Helper function for calculations
async function calculateMetrics(pool, data) {
    const {
        sector,
        country_code,
        currency_code,
        employees, // Added for completeness check
        revenue_y1, revenue_y2, revenue_y3,
        ebit_y1, ebit_y2, ebit_y3,
        revenue_f1, revenue_f2, revenue_f3, // Added missing forecast revenues
        ebit_f1, ebit_f2, ebit_f3, // Added missing forecast ebits
        top3_concentration_pct,
        founder_dependency_high,
        supplier_dependency_high,
        key_staff_retention_plan,
        documentation_readiness, // Added
        seller_flexibility, // Added
        target_timeline_months // Added
    } = data;

    // 1. FX RATE
    let calc_fx_rate = 1.0;
    if (currency_code) {
        const fxResult = await pool.query(
            'SELECT rate_to_eur FROM constant_fx_rates WHERE currency_code = $1',
            [currency_code]
        );
        if (fxResult.rows.length > 0) {
            calc_fx_rate = parseFloat(fxResult.rows[0].rate_to_eur);
        } else {
            console.warn(`FX Rate not found for currency: ${currency_code}, defaulting to 1.0`);
        }
    }

    // 2. REVENUE AVG (EUR)
    let calc_rev_avg_eur = null;
    if (calc_fx_rate !== null) {
        const r1 = Number(revenue_y1) || 0;
        const r2 = Number(revenue_y2) || 0;
        const r3 = Number(revenue_y3) || 0;
        const avg_local = (r1 + r2 + r3) / 3;
        calc_rev_avg_eur = Math.round(avg_local * calc_fx_rate);
    }

    // 3. EBIT AVG (EUR)
    let calc_ebit_avg_eur = null;
    if (calc_fx_rate !== null) {
        const e1 = Number(ebit_y1) || 0;
        const e2 = Number(ebit_y2) || 0;
        const e3 = Number(ebit_y3) || 0;
        const avg_ebit_local = (e1 + e2 + e3) / 3;
        calc_ebit_avg_eur = Math.round(avg_ebit_local * calc_fx_rate);
    }

    // 4. EBIT MARGIN %
    let calc_ebit_margin_pct = null;
    if (calc_rev_avg_eur && calc_ebit_avg_eur) {
        const revenue = Number(calc_rev_avg_eur);
        const ebit = Number(calc_ebit_avg_eur);
        if (revenue !== 0) {
            calc_ebit_margin_pct = parseFloat(((ebit / revenue) * 100).toFixed(2));
        }
    }

    // 5. EBIT CAGR %
    let calc_ebit_cagr_pct = 0.0;
    const ey1 = Number(ebit_y1);
    const ey3 = Number(ebit_y3);
    if (ey1 && ey3 && ey1 !== 0) {
        const ratio = ey3 / ey1;
        if (ratio >= 0) {
            const cagr = Math.pow(ratio, 0.5) - 1;
            calc_ebit_cagr_pct = parseFloat((cagr * 100).toFixed(2));
        }
    }

    // 6. VOLATILITY %
    let calc_volatility_pct = 0.0;
    const ey2 = Number(ebit_y2);
    const ebits = [ey1, ey2, ey3];
    const mean = (ey1 + ey2 + ey3) / 3;
    if (mean !== 0) {
        const sumSqDiff = ebits.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);
        const stdev = Math.sqrt(sumSqDiff / 2);
        const volatility = stdev / mean;
        calc_volatility_pct = parseFloat((volatility * 100).toFixed(2));
    }

    // 7. REVENUE CAGR %
    let calc_rev_cagr_pct = 0.0;
    const ry1 = Number(revenue_y1);
    const ry3 = Number(revenue_y3);
    if (ry1 && ry3 && ry1 !== 0) {
        const ratio = ry3 / ry1;
        if (ratio >= 0) {
            const cagr = Math.pow(ratio, 0.5) - 1;
            calc_rev_cagr_pct = parseFloat((cagr * 100).toFixed(2));
        }
    }

    // 8. BASE MULTIPLE, GROWTH SCORE, & SECTOR CONTEXT
    let factor_base_multiple = null;
    let growth_score = 0; // Pre-defined score from DB
    let sector_context = 0; // Calculated based on performance relative to sector

    // ... existing setup ...
    if (sector) {
        const sectorResult = await pool.query(
            'SELECT base_ebit_multiple, score, target_ebit_margin_pct, target_cagr_pct, score FROM constant_sector_metrics WHERE subsector_name_updated = $1',
            [sector]
        );

        if (sectorResult.rows.length > 0) {
            const row = sectorResult.rows[0];

            // 1. Parse Targets
            const target_margin = parseFloat(row.target_ebit_margin_pct); // e.g., 16.0
            const target_cagr = parseFloat(row.target_cagr_pct);          // e.g., 7.0
            growth_score = parseInt(row.score || 0, 10);

            // 2. Calculate Ratios
            let margin_ratio = 0;
            if (target_margin && target_margin !== 0 && calc_ebit_margin_pct !== null) {
                // Both should be in percentage terms (e.g. 27.98 / 16.0 = 1.748)
                margin_ratio = calc_ebit_margin_pct / target_margin;
            }

            let cagr_ratio = 0;
            if (target_cagr && target_cagr !== 0 && calc_rev_cagr_pct !== null) {
                cagr_ratio = calc_rev_cagr_pct / target_cagr;
            }

            // 3. Apply Logic (Floor negative ratios to 0)
            // If growth is negative, it shouldn't drag the score down to negative thousands.
            const effective_margin = Math.max(0, margin_ratio);
            const effective_cagr = Math.max(0, cagr_ratio);

            // 4. Calculate Final Score
            // Multiplier fixed to 10 (not 1000) to match your expected output of 17
            sector_context = Math.round(10 * (effective_margin + effective_cagr));

            console.log("Sector Context Inputs:");
            console.log(`Margin: ${calc_ebit_margin_pct} / ${target_margin} = ${margin_ratio}`);
            console.log(`CAGR: ${calc_rev_cagr_pct} / ${target_cagr} = ${cagr_ratio}`);
            console.log(`Calculated: 10 * (${effective_margin} + ${effective_cagr}) = ${sector_context}`);

        } else {
            console.warn(`Sector metrics not found for: ${sector}`);
        }
    }
    // 9. COUNTRY RISK
    let factor_country_risk = 0.0;
    if (country_code) {
        const countryResult = await pool.query(
            'SELECT delta_multiple FROM constant_country_adjustments WHERE country_code = $1',
            [country_code]
        );
        if (countryResult.rows.length > 0) {
            factor_country_risk = parseFloat(countryResult.rows[0].delta_multiple);
        } else {
            console.warn(`Country Risk not found for country: ${country_code}, defaulting to 0.0`);
        }
    }

    // 10. SIZE ADJUSTMENT
    let factor_size_adj = 0.0;
    if (calc_rev_avg_eur !== null) {
        const sizeResult = await pool.query(
            'SELECT rev_min_eur, delta_multiple FROM constant_size_adjustments ORDER BY rev_min_eur ASC'
        );
        const sizeRows = sizeResult.rows;
        let found = false;
        for (const row of sizeRows) {
            const limit = parseFloat(row.rev_min_eur);
            if (Number(calc_rev_avg_eur) <= limit) {
                factor_size_adj = parseFloat(row.delta_multiple);
                found = true;
                break;
            }
        }
        if (!found && sizeRows.length > 0) {
            factor_size_adj = parseFloat(sizeRows[sizeRows.length - 1].delta_multiple);
        }
    }

    // 11. CONCENTRATION ADJUSTMENT
    let factor_conc_adj = 0.0;
    if (top3_concentration_pct !== undefined && top3_concentration_pct !== null) {
        const concResult = await pool.query(
            'SELECT top3_min_pct, delta_multiple FROM constant_concentration_adjustments ORDER BY top3_min_pct ASC'
        );
        const concRows = concResult.rows;
        let found = false;
        for (const row of concRows) {
            const limit = parseFloat(row.top3_min_pct);
            if (Number(top3_concentration_pct) <= limit) {
                factor_conc_adj = parseFloat(row.delta_multiple);
                found = true;
                break;
            }
        }
        if (!found && concRows.length > 0) {
            factor_conc_adj = parseFloat(concRows[concRows.length - 1].delta_multiple);
        }
    }

    // 12. ADJUSTED MULTIPLE
    let factor_adj_multiple = null;
    if (factor_base_multiple !== null) {
        const base = Number(factor_base_multiple);
        const size = Number(factor_size_adj) || 0;
        const country = Number(factor_country_risk) || 0;
        const conc = Number(factor_conc_adj) || 0;
        const summed = base + size + country + conc;
        const cap = base + 2;
        const minVal = Math.min(summed, cap);
        factor_adj_multiple = Math.max(0.5, minVal);
        factor_adj_multiple = parseFloat(factor_adj_multiple.toFixed(2));
    }

    // 13. EV OUTPUTS
    let val_ev_low_eur = null;
    let val_ev_mid_eur = null;
    let val_ev_high_eur = null;

    if (ey3 && ebit_f1) {
        const e3 = Number(ey3);
        const ef1 = Number(ebit_f1);
        const weighted_ebit = (0.6 * e3) + (0.4 * ef1);
        const fx = calc_fx_rate || 1.0;
        const val_eur = weighted_ebit;
        const val_k = val_eur / 1000;

        const val_low_rounded = Math.round(val_k);
        val_ev_low_eur = `${val_low_rounded.toLocaleString('en-US')}k EUR`;

        const val_mid_rounded = Math.round(val_k * 0.85);
        val_ev_mid_eur = `${val_mid_rounded.toLocaleString('en-US')}k EUR`;

        const val_high_rounded = Math.round(val_k * 1.15);
        val_ev_high_eur = `${val_high_rounded.toLocaleString('en-US')}k EUR`;
    }

    // 14. FINANCIAL STRENGTH
    // Formula: financial_strength=ROUND(MIN(100,IF(B35<0.05,20*B35/0.05,IF(B35<0.15,20+40*(B35-0.05)/0.1,IF(B35<0.25,60+30*(B35-0.15)/0.1,90)))),0)
    // B35 = calc_ebit_margin_pct (as decimal)
    let financial_strength = 0;
    if (calc_ebit_margin_pct !== null) {
        const m = calc_ebit_margin_pct / 100.0;
        let score = 0;

        if (m < 0.05) {
            score = 20 * m / 0.05;
        } else if (m < 0.15) {
            score = 20 + 40 * (m - 0.05) / 0.1;
        } else if (m < 0.25) {
            score = 60 + 30 * (m - 0.15) / 0.1;
        } else {
            score = 90;
        }

        financial_strength = Math.round(Math.min(100, score));
    }

    // 15. RISK MANAGEMENT
    // Formula: risk_management=ROUND((IF(founder_dependency_high="Yes",0,100)+IF(supplier_dependency_high="Yes",0,100)+IF(top3_concentration_pct>50,50,100)+IF(key_staff_retention_plan="Yes",100,0))/4,0)
    let risk_management = 0;

    // Helper to check for "Yes" or true
    const isYes = (val) => val === true || val === 'Yes' || val === 'yes';

    const s1 = isYes(founder_dependency_high) ? 0 : 100;
    const s2 = isYes(supplier_dependency_high) ? 0 : 100;
    const s3 = (Number(top3_concentration_pct) || 0) > 50 ? 50 : 100;
    const s4 = isYes(key_staff_retention_plan) ? 100 : 0;

    risk_management = Math.round((s1 + s2 + s3 + s4) / 4);

    // 16. DATA COMPLETENESS
    // Formula: data_completeness=ROUND(100*COUNTA(B8:B30)/23,0)
    // Fields correspond to the list provided by user (23 items)
    const completionFields = [
        sector, country_code, currency_code, employees,
        revenue_y1, revenue_y2, revenue_y3,
        ebit_y1, ebit_y2, ebit_y3,
        revenue_f1, revenue_f2, revenue_f3,
        ebit_f1, ebit_f2, ebit_f3,
        top3_concentration_pct, founder_dependency_high, supplier_dependency_high,
        key_staff_retention_plan, documentation_readiness, seller_flexibility, target_timeline_months
    ];

    let filledCount = 0;
    for (const field of completionFields) {
        // Check if field is not null or undefined.
        // For strings, check if not empty.
        // For numbers/booleans, 0 or false are valid values.
        if (field !== null && field !== undefined && field !== '') {
            filledCount++;
        }
    }

    // Ensure max is 23 (though list is hardcoded 23)
    const data_completeness = Math.round((filledCount / 23) * 100);

    // 17. INVESTMENT ATTRACTIVENESS
    // Formula: investment_attractiveness = Math.round(0.3 * financial_strength + 0.25 * growth_score + 0.2 * risk_management + 0.15 * sector_context + 0.1 * data_completeness)
    const investment_attractiveness = Math.round(
        (0.3 * (financial_strength || 0)) +
        (0.25 * (growth_score || 0)) +
        (0.2 * (risk_management || 0)) +
        (0.15 * (sector_context || 0)) +
        (0.1 * (data_completeness || 0))
    );

    // 18. DEALABILITY (SIZE) SUBSCORE
    // Input: Average EBIT (EUR) -> mapped to constant_deal_size_scores
    let dealability_size_subscore = 60; // Default if input is not lower than any threshold
    console.log("revenue_y1", revenue_y1);
    console.log("revenue_y2", revenue_y2);
    console.log("revenue_y3", revenue_y3);
    const dealInput = calc_rev_avg_eur !== null ? calc_rev_avg_eur : ((Number(revenue_y1) + Number(revenue_y2) + Number(revenue_y3)) / 3);

    // Fetch thresholds (cached or fresh query)
    const dealSizeResult = await pool.query(
        'SELECT rev_min_eur, delta_multiple FROM constant_size_adjustments ORDER BY rev_min_eur ASC'
    );

    // Filter Logic: Find the first threshold where dealInput <= threshold
    for (const row of dealSizeResult.rows) {
        const threshold = Number(row.rev_min_eur);
        if (dealInput <= threshold) {
            dealability_size_subscore = parseFloat(row.delta_multiple) * 100;
            break;
        }
    }
    // 19. DEALABILITY (DOCUMENTATION) SUBSCORE
    // Formula: IF(documentation_readiness="Full",100,IF(documentation_readiness="Partial",50,0))
    let dealability_documentation_subscore = 0;
    if (documentation_readiness === 'Full') {
        dealability_documentation_subscore = 100;
    } else if (documentation_readiness === 'Partial') {
        dealability_documentation_subscore = 50;
    }

    // 20. DEALABILITY (TIMELINE) SUBSCORE
    // Formula: IF(target_timeline_months<=3,0,IF(target_timeline_months<=6,50,100))
    let dealability_timeline_subscore = 0;
    if (target_timeline_months !== undefined && target_timeline_months !== null) {
        const months = Number(target_timeline_months);
        if (months <= 3) {
            dealability_timeline_subscore = 0;
        } else if (months <= 6) {
            dealability_timeline_subscore = 50;
        } else {
            dealability_timeline_subscore = 100;
        }
    }

    // 21. DEALABILITY (FLEXIBILITY) SUBSCORE
    // Formula: IF(seller_flexibility="Yes",100,0)
    let dealability_flexibility_subscore = 0;
    if (seller_flexibility === "High") {
        dealability_flexibility_subscore = 100;
    }
    else if (seller_flexibility == "Medium") {
        dealability_flexibility_subscore = 50;
    }
    else {
        dealability_flexibility_subscore = 0;
    }

    // 22. DEALABILITY SCORE (FINAL)
    const dealability_score = Math.round(
        (dealability_size_subscore + dealability_documentation_subscore + dealability_flexibility_subscore + dealability_timeline_subscore) / 4
    );

    // 23. RISK FLAGS
    const flags = [];
    if (calc_rev_cagr_pct < 0) {
        flags.push("Negative revenue CAGR");
    }
    if (calc_ebit_margin_pct !== null && calc_ebit_margin_pct < 5.0) {
        flags.push("Low margin (<5%)");
    }

    let risk_flags = flags.join(" | ");
    if (!risk_flags) {
        risk_flags = "No major risk flags";
    }

    // 24. TAPWAY SCORE
    // Formula: ROUND(0.6*investment_attractiveness+0.4*dealability_score)
    const tapway_score = Math.round(
        (0.6 * (dealInput ? investment_attractiveness : 0)) +
        (0.4 * (dealability_score || 0))
    );
    // Correction: User requested formula is straight forward, but ensures values exist.
    // dealInput was used in dealability, so investment_attractiveness should be valid too.
    const final_tapway_score = Math.round(
        (0.6 * (investment_attractiveness || 0)) +
        (0.4 * (dealability_score || 0))
    );

    return {
        calc_fx_rate, calc_rev_avg_eur, calc_ebit_avg_eur,
        calc_ebit_margin_pct, calc_ebit_cagr_pct, calc_volatility_pct, calc_rev_cagr_pct,
        factor_base_multiple, factor_country_risk, factor_size_adj, factor_conc_adj, factor_adj_multiple,
        val_ev_low_eur, val_ev_mid_eur, val_ev_high_eur,
        financial_strength,
        risk_management,
        data_completeness,
        growth_score,
        sector_context,
        investment_attractiveness,
        dealability_size_subscore,
        dealability_documentation_subscore,
        dealability_timeline_subscore,
        dealability_flexibility_subscore,
        dealability_score,
        risk_flags,
        tapway_score: final_tapway_score
    };
}

// POST /api/valuations
// Create a new company valuation model
router.post('/', async (req, res) => {
    try {
        const {
            // 1. IDENTIFICATION
            company_name,
            sector,
            country_code,
            currency_code,
            employees,

            // 2. HISTORICAL FINANCIALS
            revenue_y1,
            revenue_y2,
            revenue_y3,
            ebit_y1,
            ebit_y2,
            ebit_y3,

            // 3. FORECAST FINANCIALS
            revenue_f1,
            revenue_f2,
            revenue_f3,
            ebit_f1,
            ebit_f2,
            ebit_f3,

            // 4. RISK & OPERATIONS INPUTS
            top3_concentration_pct,
            founder_dependency_high,
            supplier_dependency_high,
            key_staff_retention_plan,
            documentation_readiness,
            seller_flexibility,
            target_timeline_months

        } = req.body;

        // Basic validation
        if (!company_name) {
            return res.status(400).json({ error: 'Company name is required' });
        }

        const metrics = await calculateMetrics(pool, req.body);

        const query = `
            INSERT INTO company_standard_valuation_models (
                company_name, sector, country_code, currency_code, employees,
                revenue_y1, revenue_y2, revenue_y3,
                ebit_y1, ebit_y2, ebit_y3,
                revenue_f1, revenue_f2, revenue_f3,
                ebit_f1, ebit_f2, ebit_f3,
                top3_concentration_pct, founder_dependency_high, supplier_dependency_high,
                key_staff_retention_plan, documentation_readiness, seller_flexibility, target_timeline_months,
                
                calc_fx_rate, calc_rev_avg_eur, calc_ebit_avg_eur,
                calc_ebit_margin_pct, calc_ebit_cagr_pct, calc_volatility_pct, calc_rev_cagr_pct,
                factor_base_multiple, factor_country_risk, factor_size_adj, factor_conc_adj, factor_adj_multiple,
                val_ev_low_eur, val_ev_mid_eur, val_ev_high_eur,
                
                financial_strength, growth_score, risk_management, data_completeness,
                sector_context, investment_attractiveness,
                dealability_size_subscore, dealability_documentation_subscore,
                dealability_flexibility_subscore, dealability_timeline_subscore, dealability_score,
                risk_flags, tapway_score
            )
            VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8,
                $9, $10, $11,
                $12, $13, $14,
                $15, $16, $17,
                $18, $19, $20,
                $21, $22, $23, $24,
                $25, $26, $27,
                $28, $29, $30, $31,
                $32, $33, $34, $35, $36,
                $37, $38, $39,
                $40, $41, $42, $43, $44, $45,
                $46, $47, $48, $49, $50,
                $51, $52
            )
            RETURNING *;
        `;

        const values = [
            company_name, sector, country_code, currency_code, employees,
            revenue_y1, revenue_y2, revenue_y3,
            ebit_y1, ebit_y2, ebit_y3,
            revenue_f1, revenue_f2, revenue_f3,
            ebit_f1, ebit_f2, ebit_f3,
            top3_concentration_pct, founder_dependency_high, supplier_dependency_high,
            key_staff_retention_plan, documentation_readiness, seller_flexibility, target_timeline_months,

            metrics.calc_fx_rate, metrics.calc_rev_avg_eur, metrics.calc_ebit_avg_eur,
            metrics.calc_ebit_margin_pct, metrics.calc_ebit_cagr_pct, metrics.calc_volatility_pct, metrics.calc_rev_cagr_pct,
            metrics.factor_base_multiple, metrics.factor_country_risk, metrics.factor_size_adj, metrics.factor_conc_adj, metrics.factor_adj_multiple,
            metrics.val_ev_low_eur, metrics.val_ev_mid_eur, metrics.val_ev_high_eur,

            metrics.financial_strength, metrics.growth_score, metrics.risk_management, metrics.data_completeness,
            metrics.sector_context, metrics.investment_attractiveness,
            metrics.dealability_size_subscore, metrics.dealability_documentation_subscore,
            metrics.dealability_flexibility_subscore, metrics.dealability_timeline_subscore, metrics.dealability_score,
            metrics.risk_flags, metrics.tapway_score
        ];


        const result = await pool.query(query, values);
        res.status(201).json(result.rows[0]);


    } catch (error) {
        console.error('Error creating valuation model:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/valuations/:companyName
// Fetch a company valuation model by company name
router.get('/:companyName', async (req, res) => {
    try {
        const companyName = decodeURIComponent(req.params.companyName);
        const query = 'SELECT * FROM company_standard_valuation_models WHERE company_name = $1';
        const result = await pool.query(query, [companyName]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Valuation model not found for this company' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching valuation model:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/valuations/test-calculation
// Test route with hardcoded data
router.post('/test-calculation', async (req, res) => {
    try {
        const mockData = {
            company_name: "Amazon",
            sector: "E-Commerce Logistics",
            country_code: "US",
            currency_code: "USD",
            employees: 1525000,
            revenue_y1: "574785000000",
            revenue_y2: "513983000000",
            revenue_y3: "469822000000",
            ebit_y1: "36852000000",
            ebit_y2: "12248000000",
            ebit_y3: "24879000000",
            revenue_f1: "620000000000",
            revenue_f2: "680000000000",
            revenue_f3: "750000000000",
            ebit_f1: "42000000000",
            ebit_f2: "50000000000",
            ebit_f3: "60000000000",
            top3_concentration_pct: 30,
            founder_dependency_high: true,
            supplier_dependency_high: true,
            key_staff_retention_plan: true,
            documentation_readiness: 'Full',
            seller_flexibility: 'Medium',
            target_timeline_months: 4
        };

        const metrics = await calculateMetrics(pool, mockData);
        res.json({
            input: mockData,
            calculated_metrics: metrics
        });

    } catch (error) {
        console.error('Error in test calculation:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/valuations/update-scores
// Manually update scores for a specific company
router.post('/update-scores', async (req, res) => {
    try {
        const {
            company_name,
            financial_strength,
            growth_score,
            risk_management,
            data_completeness,
            sector_context,
            dealability_size_subscore,
            dealability_documentation_subscore,
            dealability_flexibility_subscore, // Maps to 'Market Appeal' or 'Flexibility'
            dealability_timeline_subscore,
            dealability_score,
            risk_flags,
            // confidence_band // Note: This column does not exist in the schema for standard valuations
        } = req.body;

        if (!company_name) {
            return res.status(400).json({ error: 'Company name is required' });
        }

        // Check if company exists
        const checkQuery = 'SELECT id FROM company_standard_valuation_models WHERE company_name = $1';
        const checkResult = await pool.query(checkQuery, [company_name]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Company not found' });
        }

        const updateQuery = `
            UPDATE company_standard_valuation_models
            SET
                financial_strength = COALESCE($2, financial_strength),
                growth_score = COALESCE($3, growth_score),
                risk_management = COALESCE($4, risk_management),
                data_completeness = COALESCE($5, data_completeness),
                sector_context = COALESCE($6, sector_context),
                dealability_size_subscore = COALESCE($7, dealability_size_subscore),
                dealability_documentation_subscore = COALESCE($8, dealability_documentation_subscore),
                dealability_flexibility_subscore = COALESCE($9, dealability_flexibility_subscore),
                dealability_timeline_subscore = COALESCE($10, dealability_timeline_subscore),
                dealability_score = COALESCE($11, dealability_score),
                risk_flags = COALESCE($12, risk_flags)
            WHERE company_name = $1
            RETURNING *;
        `;

        const values = [
            company_name,
            financial_strength,
            growth_score,
            risk_management,
            data_completeness,
            sector_context,
            dealability_size_subscore,
            dealability_documentation_subscore,
            dealability_flexibility_subscore,
            dealability_timeline_subscore,
            dealability_score,
            risk_flags
        ];

        const result = await pool.query(updateQuery, values);
        res.json(result.rows[0]);

    } catch (error) {
        console.error('Error updating valuation scores:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
