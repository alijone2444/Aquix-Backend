const express = require('express');
const router = express.Router();
const pool = require('../db');

// Helper function for calculations
async function calculateMetrics(pool, data) {
    const {
        sector,
        country,
        annual_revenue,
        ebit,
        currency,
        employees,
        top3_customers_pct
    } = data;

    // 1. FX RATE
    let calc_fx_rate_to_eur = 1.0;
    if (currency) {
        const fxResult = await pool.query(
            'SELECT rate_to_eur FROM constant_fx_rates WHERE currency_code = $1',
            [currency]
        );
        if (fxResult.rows.length > 0) {
            calc_fx_rate_to_eur = parseFloat(fxResult.rows[0].rate_to_eur);
        } else {
            console.warn(`FX Rate not found for currency: ${currency}, defaulting to 1.0`);
        }
    }

    // 2. EBIT (EUR)
    let calc_ebit_eur = null;
    if (ebit !== undefined && ebit !== null) {
        calc_ebit_eur = Math.round(Number(ebit) * calc_fx_rate_to_eur);
    }

    // 3. BASE EBIT MULTIPLE
    let factor_base_ebit_multiple = null;
    if (sector) {
        const sectorResult = await pool.query(
            'SELECT base_ebit_multiple FROM constant_sector_metrics WHERE subsector_name_updated = $1',
            [sector]
        );
        if (sectorResult.rows.length > 0) {
            factor_base_ebit_multiple = parseFloat(sectorResult.rows[0].base_ebit_multiple);
        } else {
            console.warn(`Base Multiple not found for sector: ${sector}`);
        }
    }
    // 4. COUNTRY RISK
    let factor_country_risk = 0.0;
    if (country) {
        const countryResult = await pool.query(
            'SELECT delta_multiple FROM constant_country_adjustments WHERE country_code = $1',
            [country]
        );
        if (countryResult.rows.length > 0) {
            factor_country_risk = parseFloat(countryResult.rows[0].delta_multiple);
        } else {
            console.warn(`Country Risk not found for country: ${country}, defaulting to 0.0`);
        }
    }

    // 5. SIZE ADJUSTMENT
    let factor_size_adj = 0.0;
    const calc_rev_eur = (annual_revenue !== undefined && annual_revenue !== null)
        ? Math.round(Number(annual_revenue) * calc_fx_rate_to_eur)
        : null;

    if (calc_rev_eur !== null) {
        const sizeResult = await pool.query(
            'SELECT rev_min_eur, delta_multiple FROM constant_size_adjustments ORDER BY rev_min_eur ASC'
        );
        const sizeRows = sizeResult.rows;
        let found = false;
        for (const row of sizeRows) {
            const limit = parseFloat(row.rev_min_eur);
            if (Number(calc_rev_eur) <= limit) {
                factor_size_adj = parseFloat(row.delta_multiple);
                found = true;
                break;
            }
        }
        if (!found && sizeRows.length > 0) {
            factor_size_adj = parseFloat(sizeRows[sizeRows.length - 1].delta_multiple);
        }
    }

    // 6. CONCENTRATION ADJUSTMENT
    let factor_conc_adj = 0.0;
    if (top3_customers_pct !== undefined && top3_customers_pct !== null) {
        const concResult = await pool.query(
            'SELECT top3_min_pct, delta_multiple FROM constant_concentration_adjustments ORDER BY top3_min_pct ASC'
        );
        const concRows = concResult.rows;
        let found = false;

        // Start from index 1 as requested
        for (let i = 1; i < concRows.length; i++) {
            const limit = parseFloat(concRows[i].top3_min_pct);

            if (Number(top3_customers_pct) <= limit) {
                // Assign value of PREVIOUS delta_multiple
                factor_conc_adj = parseFloat(concRows[i - 1].delta_multiple);
                found = true;
                break;
            }
        }

        // If not lower than any (or if only 1 row), assign the last one's delta
        if (!found && concRows.length > 0) {
            factor_conc_adj = parseFloat(concRows[concRows.length - 1].delta_multiple);
        }
    }

    // 7. CALCULATED ADJUSTED MULTIPLE
    let val_calc_adj_multiple = null;
    if (factor_base_ebit_multiple !== null) {
        val_calc_adj_multiple = factor_base_ebit_multiple * (1 + (factor_country_risk || 0) + (factor_size_adj || 0) + (factor_conc_adj || 0));
        val_calc_adj_multiple = parseFloat(val_calc_adj_multiple.toFixed(2));
    }

    // 8. EV MID
    let val_ev_mid = null;
    let val_ev_mid_eur_k = null;

    if (calc_ebit_eur !== null && val_calc_adj_multiple !== null) {
        // Full Enterprise Value
        val_ev_mid = Math.round(calc_ebit_eur * val_calc_adj_multiple);
        // Formatted String: e.g. "1,200k EUR"
        const val_k = Math.round(val_ev_mid / 1000);
        val_ev_mid_eur_k = `${val_k.toLocaleString('en-US')}k EUR`;
    }


    // 9. EV LOW (85%)
    let val_ev_low = null;
    let val_ev_low_eur_k = null;

    if (val_ev_mid !== null) {
        val_ev_low = Math.round(val_ev_mid * 0.85);
        const val_k = Math.round(val_ev_low / 1000);
        val_ev_low_eur_k = `${val_k.toLocaleString('en-US')}k EUR`;
    }

    // 10. EV HIGH (115%)
    let val_ev_high = null;
    let val_ev_high_eur_k = null;

    if (val_ev_mid !== null) {
        val_ev_high = Math.round(val_ev_mid * 1.15);
        const val_k = Math.round(val_ev_high / 1000);
        val_ev_high_eur_k = `${val_k.toLocaleString('en-US')}k EUR`;
    }

    // 11. RISK COMMENT
    const riskFlags = [];
    if (top3_customers_pct !== undefined && top3_customers_pct !== null) {
        const t3 = Number(top3_customers_pct);
        if (t3 >= 60) {
            riskFlags.push("Very high customer concentration");
        } else if (t3 >= 45) {
            riskFlags.push("High customer concentration");
        }
    }

    if (annual_revenue && ebit) {
        const margin = Number(ebit) / Number(annual_revenue);
        if (margin < 0.05) {
            riskFlags.push("Very low profitability");
        }
    }

    if (factor_country_risk !== null && factor_country_risk <= -0.4) {
        riskFlags.push("Elevated country risk");
    }

    let risk_comment = riskFlags.length > 0 ? riskFlags.join(" | ") : "No major concentration risk";
    // 12. PLAUSIBILITY CHECK
    let plausibility_check = "PASS";
    const revCheck = Number(annual_revenue);
    const ebitCheck = Number(ebit);
    const top3Check = top3_customers_pct !== null && top3_customers_pct !== undefined ? Number(top3_customers_pct) : 0;
    const empCheck = employees !== null && employees !== undefined ? Number(employees) : 0;

    if (revCheck <= 0 || ebitCheck < 0 || top3Check > 100 || top3Check < 0) {
        plausibility_check = "FAIL";
    } else {
        const margin = revCheck !== 0 ? ebitCheck / revCheck : 0;
        const revPerEmp = empCheck > 0 ? revCheck / empCheck : 9999999;

        if (margin < 0.03 || margin > 0.45) {
            plausibility_check = "REVIEW";
        } else if (revPerEmp < 50000 || revPerEmp > 2500000) {
            plausibility_check = "REVIEW";
        }
    }
    // 13. ACQUISITION SCORE
    let acquisition_score = 0;
    const C15 = 0; // As requested

    // Term 1: Profitability (30%)
    let term1 = 0;
    const rev = Number(annual_revenue) || 0;
    const eb = Number(ebit) || 0;
    if (rev > 0) {
        const margin = eb / rev;
        if (margin <= 0) {
            term1 = 0;
        } else if (margin <= 0.05) {
            term1 = 0.2 * (margin / 0.05);
        } else if (margin <= 0.15) {
            term1 = 0.2 + 0.4 * ((margin - 0.05) / 0.1);
        } else if (margin <= 0.25) {
            term1 = 0.6 + 0.3 * ((margin - 0.15) / 0.1);
        } else if (margin >= 0.3) {
            term1 = 1;
        } else {
            // 0.25 < margin < 0.3
            term1 = 0.9 + 0.1 * ((margin - 0.25) / 0.05);
        }
    }

    // Term 2: Concentration (25%)
    let term2 = 1; // Default to 1 (max score) if less than 30% concentration
    const t3 = top3_customers_pct !== null ? Number(top3_customers_pct) : 0;
    if (t3 >= 60) {
        term2 = 0;
    } else if (t3 >= 45) {
        term2 = 0.3 + (0 - 0.3) * ((t3 - 45) / 15);
    } else if (t3 >= 30) {
        term2 = 0.7 + (0.3 - 0.7) * ((t3 - 30) / 15);
    }

    // Term 3: Size (25%)
    let term3 = 0.2;
    const sizeVal = rev * C15; // C15 is 0, so sizeVal is 0
    if (sizeVal < 5000000) {
        term3 = 0.2;
    } else if (sizeVal < 15000000) {
        term3 = 0.5;
    } else if (sizeVal < 50000000) {
        term3 = 0.7;
    } else if (sizeVal < 100000000) {
        term3 = 0.9;
    } else {
        term3 = 1;
    }

    // Term 4: Multiple (20%)
    let term4 = 0.2;
    const m = factor_base_ebit_multiple !== null ? Number(factor_base_ebit_multiple) : 0;
    if (m <= -0.3) {
        term4 = 0.2;
    } else if (m < 0) {
        term4 = 0.2 + (0.6 - 0.2) * ((m + 0.3) / 0.3);
    } else if (m < 0.2) {
        term4 = 0.6 + (0.8 - 0.6) * (m / 0.2);
    } else if (m >= 0.4) {
        term4 = 1;
    } else {
        // 0.2 <= m < 0.4
        term4 = 0.8 + (1 - 0.8) * ((m - 0.2) / 0.2);
    }

    // Total Score
    const rawScore = 100 * (0.3 * term1 + 0.25 * term2 + 0.25 * term3 + 0.2 * term4);
    acquisition_score = Math.max(0, Math.min(100, Math.round(rawScore)));

    // TODO: Implement calculation logic here later
    // For now, we return nulls as per instructions.

    return {
        calc_fx_rate_to_eur,
        calc_ebit_eur,
        factor_base_ebit_multiple,
        factor_country_risk,
        factor_size_adj,
        factor_conc_adj,
        val_calc_adj_multiple,
        val_ev_mid,
        val_ev_mid_eur_k,
        val_ev_low,
        val_ev_low_eur_k,
        val_ev_high,
        val_ev_high_eur_k,
        risk_comment,
        plausibility_check,
        acquisition_score
    };
}

// POST /api/free-valuations
// Create a new free company valuation model
router.post('/', async (req, res) => {
    try {
        const {
            company_name,
            sector,
            country,
            annual_revenue,
            ebit,
            currency,
            employees,
            top3_customers_pct
        } = req.body;

        // Basic validation
        if (!company_name) {
            return res.status(400).json({ error: 'Company name is required' });
        }

        const metrics = await calculateMetrics(pool, req.body);

        const query = `
            INSERT INTO company_free_valuation_models (
                company_name,
                sector,
                country,
                annual_revenue,
                ebit,
                currency,
                employees,
                top3_customers_pct,
                
                calc_fx_rate_to_eur,
                calc_ebit_eur,
                factor_base_ebit_multiple,
                factor_country_risk,
                factor_size_adj,
                factor_conc_adj,
                val_calc_adj_multiple,
                val_ev_mid,
                val_ev_mid_eur_k,
                val_ev_low,
                val_ev_low_eur_k,
                val_ev_high,
                val_ev_high_eur_k,
                risk_comment,
                plausibility_check,
                acquisition_score
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8,
                $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
            )
            RETURNING *;
        `;

        const values = [
            company_name,
            sector,
            country,
            annual_revenue,
            ebit,
            currency,
            employees,
            top3_customers_pct,

            metrics.calc_fx_rate_to_eur,
            metrics.calc_ebit_eur,
            metrics.factor_base_ebit_multiple,
            metrics.factor_country_risk,
            metrics.factor_size_adj,
            metrics.factor_conc_adj,
            metrics.val_calc_adj_multiple,
            metrics.val_ev_mid,
            metrics.val_ev_mid_eur_k,
            metrics.val_ev_low,
            metrics.val_ev_low_eur_k,
            metrics.val_ev_high,
            metrics.val_ev_high_eur_k,
            metrics.risk_comment,
            metrics.plausibility_check,
            metrics.acquisition_score
        ];

        const result = await pool.query(query, values);
        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error('Error creating free valuation model:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/free-valuations/:companyName
// Fetch a company free valuation model by company name
router.get('/:companyName', async (req, res) => {
    try {
        const companyName = decodeURIComponent(req.params.companyName);
        const query = 'SELECT * FROM company_free_valuation_models WHERE company_name = $1';
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

// POST /api/free-valuations/test-calculation
// Test route with hardcoded data
router.post('/test-calculation', async (req, res) => {
    try {
        const mockData = {
            company_name: "Test Free Valuation",
            sector: "Automotive Suppliers (Tier-1/2/3)",
            country: "US",
            annual_revenue: 53823000000,
            ebit: 6523000000,
            currency: "USD",
            employees: 140000,
            top3_customers_pct: 50
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

// Manually update scores for a specific company
router.post('/update-scores', async (req, res) => {
    try {
        const {
            company_name,

            calc_fx_rate_to_eur,
            calc_ebit_eur,
            factor_base_ebit_multiple,
            factor_country_risk,
            factor_size_adj,
            factor_conc_adj,
            val_calc_adj_multiple,
            val_ev_mid,
            val_ev_mid_eur_k,
            val_ev_low,
            val_ev_low_eur_k,
            val_ev_high,
            val_ev_high_eur_k,
            risk_comment,
            plausibility_check,
            acquisition_score
        } = req.body;

        if (!company_name) {
            return res.status(400).json({ error: 'Company name is required' });
        }

        // Check if company exists
        const checkQuery = 'SELECT id FROM company_free_valuation_models WHERE company_name = $1';
        const checkResult = await pool.query(checkQuery, [company_name]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Company not found' });
        }

        const updateQuery = `
            UPDATE company_free_valuation_models
            SET
                calc_fx_rate_to_eur = COALESCE($2, calc_fx_rate_to_eur),
                calc_ebit_eur = COALESCE($3, calc_ebit_eur),
                factor_base_ebit_multiple = COALESCE($4, factor_base_ebit_multiple),
                factor_country_risk = COALESCE($5, factor_country_risk),
                factor_size_adj = COALESCE($6, factor_size_adj),
                factor_conc_adj = COALESCE($7, factor_conc_adj),
                val_calc_adj_multiple = COALESCE($8, val_calc_adj_multiple),
                val_ev_mid = COALESCE($9, val_ev_mid),
                val_ev_mid_eur_k = COALESCE($10, val_ev_mid_eur_k),
                val_ev_low = COALESCE($11, val_ev_low),
                val_ev_low_eur_k = COALESCE($12, val_ev_low_eur_k),
                val_ev_high = COALESCE($13, val_ev_high),
                val_ev_high_eur_k = COALESCE($14, val_ev_high_eur_k),
                risk_comment = COALESCE($15, risk_comment),
                plausibility_check = COALESCE($16, plausibility_check),
                acquisition_score = COALESCE($17, acquisition_score)
            WHERE company_name = $1
            RETURNING *;
        `;

        const values = [
            company_name,
            calc_fx_rate_to_eur,
            calc_ebit_eur,
            factor_base_ebit_multiple,
            factor_country_risk,
            factor_size_adj,
            factor_conc_adj,
            val_calc_adj_multiple,
            val_ev_mid,
            val_ev_mid_eur_k,
            val_ev_low,
            val_ev_low_eur_k,
            val_ev_high,
            val_ev_high_eur_k,
            risk_comment,
            plausibility_check,
            acquisition_score
        ];

        const result = await pool.query(updateQuery, values);
        res.json(result.rows[0]);

    } catch (error) {
        console.error('Error updating valuation scores:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
