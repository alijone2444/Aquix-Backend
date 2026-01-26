const express = require('express');
const router = express.Router();
const pool = require('../db');


// Helper function for calculations
async function calculateMetrics(pool, data) {
    const {
        sector,
        country_code,
        currency_code,
        revenue_y1, revenue_y2, revenue_y3,
        ebit_y1, ebit_y2, ebit_y3,
        ebit_f1,
        top3_concentration_pct
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

    // 8. BASE MULTIPLE
    let factor_base_multiple = null;
    if (sector) {
        const sectorResult = await pool.query(
            'SELECT base_ebit_multiple FROM constant_sector_metrics WHERE subsector_name_updated = $1',
            [sector]
        );
        if (sectorResult.rows.length > 0) {
            factor_base_multiple = parseFloat(sectorResult.rows[0].base_ebit_multiple);
        } else {
            console.warn(`Base Multiple not found for sector: ${sector}`);
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

    return {
        calc_fx_rate, calc_rev_avg_eur, calc_ebit_avg_eur,
        calc_ebit_margin_pct, calc_ebit_cagr_pct, calc_volatility_pct, calc_rev_cagr_pct,
        factor_base_multiple, factor_country_risk, factor_size_adj, factor_conc_adj, factor_adj_multiple,
        val_ev_low_eur, val_ev_mid_eur, val_ev_high_eur
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
            INSERT INTO company_valuation_models (
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
                val_ev_low_eur, val_ev_mid_eur, val_ev_high_eur
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
                $37, $38, $39
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
            metrics.val_ev_low_eur, metrics.val_ev_mid_eur, metrics.val_ev_high_eur
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
        const query = 'SELECT * FROM company_valuation_models WHERE company_name = $1';
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
router.get('/test-calculation', async (req, res) => {
    try {
        const mockData = {
            company_name: "Test Valuation Data",
            sector: "Consumer Electronics Brands",
            country_code: "US",
            currency_code: "USD",
            employees: 161000,
            revenue_y1: "394328000000",
            revenue_y2: "365817000000",
            revenue_y3: "274515000000",
            ebit_y1: "114301000000",
            ebit_y2: "108949000000",
            ebit_y3: "66288000000",
            revenue_f1: "420000000000",
            revenue_f2: "450000000000",
            revenue_f3: "480000000000",
            ebit_f1: "120000000000",
            ebit_f2: "130000000000",
            ebit_f3: "145000000000",
            top3_concentration_pct: 25,
            founder_dependency_high: false,
            supplier_dependency_high: false,
            key_staff_retention_plan: true,
            documentation_readiness: 'Full',
            seller_flexibility: 'High',
            target_timeline_months: 3
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

module.exports = router;
