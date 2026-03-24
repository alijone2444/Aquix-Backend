const express = require('express');
const router = express.Router();
const pool = require('../db');


// Helper function to parse Excel-style dates like "30-Sep-24"
function parseExcelDate(dateStr) {
    if (!dateStr) return null;

    // Handle "30-Sep-24" format
    const excelDatePattern = /^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/;
    const match = dateStr.match(excelDatePattern);

    if (match) {
        const day = parseInt(match[1], 10);
        const monthStr = match[2].toLowerCase();
        const yearShort = parseInt(match[3], 10);
        const year = 2000 + yearShort; // Assume 21st century for 2-digit years

        const months = {
            'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
            'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
        };

        if (months.hasOwnProperty(monthStr)) {
            const date = new Date(Date.UTC(year, months[monthStr], day));
            return date.toISOString().split('T')[0]; // Returns YYYY-MM-DD
        }
    }

    // Handle "MM/DD/YYYY" or "M/D/YYYY" format (e.g. 9/30/2024)
    const slashDatePattern = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/;
    const slashMatch = dateStr.match(slashDatePattern);
    if (slashMatch) {
        const p1 = parseInt(slashMatch[1], 10);
        const p2 = parseInt(slashMatch[2], 10);
        const year = parseInt(slashMatch[3], 10);

        let month, day;
        // Basic detection: if 1st part > 12, it must be Day (DMY). Otherwise assume MDY (US).
        if (p1 > 12 && p2 <= 12) {
            day = p1;
            month = p2;
        } else {
            month = p1;
            day = p2;
        }

        // Date.UTC months are 0-indexed
        const date = new Date(Date.UTC(year, month - 1, day));
        return date.toISOString().split('T')[0];
    }

    // Attempt standard parsing (e.g. ISO string)
    const standardDate = new Date(dateStr);
    if (!isNaN(standardDate.getTime())) {
        return standardDate.toISOString().split('T')[0];
    }

    return dateStr; // Return original if parsing fails
}

// Helper function for calculations
async function calculateMetrics(pool, data) {
    const {
        sector,
        country_code,
        currency_code,
        revenue_y1, revenue_y2, revenue_y3,
        ebit_y1, ebit_y2, ebit_y3,
        ebit_f1,
        revenue_f1,
        top3_concentration_pct,
        total_debt,
        current_assets,
        current_liabilities,
        credit_rating,
        ownership_pct,
        mgmt_turnover_pct,
        litigation_active,
        documentation_readiness,
        seller_flexibility,
        target_timeline_months,
        valuation_date,
        financials_audited
    } = data;

    // 1. FX RATE
    let calc_fx_rate = 1.0;
    if (currency_code) {
        const fxResult = await pool.query(
            'SELECT rate_to_eur FROM constant_fx_rates WHERE TRIM(LOWER(currency_code)) = TRIM(LOWER($1))',
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
    const vol_ry1 = Number(revenue_y1);
    const vol_ry2 = Number(revenue_y2);
    const vol_ry3 = Number(revenue_y3);
    const revenues = [vol_ry1, vol_ry2, vol_ry3];
    const vol_mean = (vol_ry1 + vol_ry2 + vol_ry3) / 3;

    if (vol_mean !== 0) {
        const sumSqDiff = revenues.reduce((acc, val) => acc + Math.pow(val - vol_mean, 2), 0);
        const stdev = Math.sqrt(sumSqDiff / 2);
        const volatility = stdev / vol_mean;
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

    // 8. BASE MULTIPLE & SECTOR TARGETS
    let factor_base_multiple = null;
    let sector_target_margin = null;
    let sector_target_cagr = null;

    if (sector) {
        const sectorResult = await pool.query(
            'SELECT base_ebit_multiple, target_ebit_margin_pct, target_cagr_pct FROM constant_sector_metrics WHERE TRIM(LOWER(subsector_name_updated)) = TRIM(LOWER($1))',
            [sector]
        );
        if (sectorResult.rows.length > 0) {
            factor_base_multiple = parseFloat(sectorResult.rows[0].base_ebit_multiple);
            sector_target_margin = parseFloat(sectorResult.rows[0].target_ebit_margin_pct);
            sector_target_cagr = parseFloat(sectorResult.rows[0].target_cagr_pct);
        } else {
            console.warn(`Sector metrics not found for sector: ${sector}`);
        }
    }

    // 9. COUNTRY RISK
    let factor_country_risk = 0.0;
    if (country_code) {
        const countryResult = await pool.query(
            'SELECT delta_multiple FROM constant_country_adjustments WHERE TRIM(LOWER(country_code)) = TRIM(LOWER($1))',
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

    // 13. EV OUTPUTS CONTEXT (Moved Calculation to end)
    let val_ev_low_eur = null;
    let val_ev_mid_eur = null;
    let val_ev_high_eur = null;

    // 14. FINANCIAL STRENGTH
    let financial_strength = 0;
    if (calc_ebit_margin_pct !== null && calc_rev_cagr_pct !== null && calc_volatility_pct !== null) {
        // Note: Volatility is 0-100, so "1 - vol" in decimal becomes "100 - vol" in percentage points.
        financial_strength = (0.4 * calc_ebit_margin_pct) + (0.3 * calc_rev_cagr_pct) + (0.3 * (1 - calc_volatility_pct));
        financial_strength = Math.round(financial_strength);
    }

    // 15. DEBT / EBITDA (Using EBIT Avg EUR as proxy)
    let calc_debt_ebitda_ratio = 0.0;
    if (calc_ebit_avg_eur && calc_ebit_avg_eur !== 0) {
        const debt = Number(total_debt) || 0;
        const ebit = Number(calc_ebit_avg_eur);
        const ratio = debt / ebit;
        calc_debt_ebitda_ratio = parseFloat(ratio.toFixed(2));
    }

    // 16. CURRENT RATIO
    let calc_current_ratio = 0.0;
    const assets = Number(current_assets) || 0;
    const liabilities = Number(current_liabilities);
    if (liabilities && liabilities !== 0) {
        calc_current_ratio = parseFloat((assets / liabilities).toFixed(2));
    }

    // 17. NORMALIZED EBIT (EUR)
    // Formula: 0.6 * ebit_y3 + 0.4 * revenue_f1
    let val_norm_ebit_eur = null;
    let ev_mid_val = 0; // Lifted for Dealability Score

    if (ebit_y3 && ebit_f1) {
        const e3 = Number(ebit_y3);
        const rf1 = Number(ebit_f1);
        const weighted = (0.6 * e3) + (0.4 * rf1);
        console.log(weighted);
        val_norm_ebit_eur = weighted;
    }

    // 18. FINAL EV CALCULATIONS
    // Variables initialized in Step 13

    if (val_norm_ebit_eur !== null && factor_adj_multiple !== null && calc_fx_rate !== null) {
        const norm_ebit = Number(val_norm_ebit_eur);
        const multiple = Number(factor_adj_multiple);
        const fx_rate = Number(calc_fx_rate);

        ev_mid_val = norm_ebit * multiple * fx_rate;
        const ev_mid_k = ev_mid_val / 1000;
        const ev_mid_rounded = Math.round(ev_mid_k);
        val_ev_mid_eur = ev_mid_rounded;

        const ev_low_k = ev_mid_k * 0.85;
        const ev_low_rounded = Math.round(ev_low_k);
        val_ev_low_eur = ev_low_rounded;

        const ev_high_k = ev_mid_k * 1.15;
        const ev_high_rounded = Math.round(ev_high_k);
        val_ev_high_eur = ev_high_rounded;
    }

    // 19. RISK MANAGEMENT SCORE
    let risk_management = 0;

    // 19a. Fetch Credit Score
    let credit_score = 0;
    if (credit_rating) {
        const creditResult = await pool.query(
            'SELECT score FROM constant_credit_ratings WHERE rating = $1',
            [credit_rating]
        );
        if (creditResult.rows.length > 0) {
            credit_score = parseInt(creditResult.rows[0].score, 10);
        }
    }
    console.log("Credit Score:", credit_score);
    // 19b. Calculate Weighted Score
    const s_credit = 0.25 * credit_score;

    const val_leverage = Number(calc_debt_ebitda_ratio) || 0;
    const s_leverage = 0.15 * Math.max(0, 100 - (val_leverage * 20));

    const val_liquidity = Number(calc_current_ratio) || 0;
    const s_liquidity = 0.15 * Math.min(100, val_liquidity * 50);

    const val_ownership = Number(ownership_pct) || 0;
    const s_ownership = 0.15 * Math.max(0, 100 - val_ownership);

    const val_mgmt = Number(mgmt_turnover_pct) || 0;
    const s_mgmt = 0.10 * Math.max(0, 100 - val_mgmt);

    const s_litigation = 0.10 * (litigation_active ? 50 : 100);

    const val_country = Number(factor_country_risk) || 0;
    // Formula per user: 100 - (factor_country_risk * 100)
    const s_country = 0.10 * Math.max(0, 100 - (val_country * 100));

    risk_management = Math.round(s_credit + s_leverage + s_liquidity + s_ownership + s_mgmt + s_litigation + s_country);

    // 20. MARKET CONTEXT SCORE
    let market_context = 0;
    if (factor_adj_multiple !== null && factor_base_multiple &&
        calc_rev_cagr_pct !== null && sector_target_cagr &&
        calc_ebit_margin_pct !== null && sector_target_margin) {

        // Ratio 1: Valuation Performance (50%)
        // Impact: 50 * (factor_adj_multiple / base_ebit_multiple)
        const r1 = factor_base_multiple !== 0 ? (factor_adj_multiple / factor_base_multiple) : 0;
        const impact1 = 50 * r1;

        // Ratio 2: Growth Performance (25%)
        // Impact: 25 * (calc_rev_cagr_pct / target_cagr_pct)
        const r2 = sector_target_cagr !== 0 ? (calc_rev_cagr_pct / sector_target_cagr) : 0;
        const impact2 = 25 * r2;

        // Ratio 3: Profitability Performance (25%)
        // Impact: 25 * (calc_ebit_margin_pct / target_ebit_margin_pct)
        const r3 = sector_target_margin !== 0 ? (calc_ebit_margin_pct / sector_target_margin) : 0;
        const impact3 = 25 * r3;

        const sum = impact1 + impact2 + impact3;
        const capped = Math.min(100, sum);
        market_context = Math.round(capped);
    }

    // 21. DEALABILITY SIZE SUBSCORE
    let dealability_size_subscore = 0;
    if (ev_mid_val > 0) {
        const sizeScoresResult = await pool.query(
            'SELECT ev_min_eur, size_score FROM constant_deal_size_scores ORDER BY ev_min_eur ASC'
        );
        const sizeScores = sizeScoresResult.rows;

        // Default to first score if available
        if (sizeScores.length > 0) {
            dealability_size_subscore = parseInt(sizeScores[0].size_score, 10);
        }

        for (const band of sizeScores) {
            const minEur = parseFloat(band.ev_min_eur); // Note: BIGINT comes as string from pg
            if (ev_mid_val >= minEur) {
                dealability_size_subscore = parseInt(band.size_score, 10);
            } else {
                // Since it's sorted ASC, once we fail a check (EV < Band Min),
                // we stop because we've already found the highest applicable band in previous iteration.
                break;
            }
        }
    }

    // 22. DEALABILITY DOCUMENTATION SUBSCORE
    let dealability_documentation_subscore = 0;
    if (documentation_readiness === 'Full') {
        dealability_documentation_subscore = 100;
    } else if (documentation_readiness === 'Partial') {
        dealability_documentation_subscore = 50;
    }

    // 23. DEALABILITY FLEXIBILITY SUBSCORE
    let dealability_flexibility_subscore = 0;
    if (seller_flexibility === 'High') {
        dealability_flexibility_subscore = 100;
    } else if (seller_flexibility === 'Medium') {
        dealability_flexibility_subscore = 50;
    }

    // 24. DEALABILITY TIMELINE SUBSCORE
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

    // 25. DEALABILITY SCORE (FINAL)
    // Formula: Round(Average of 4 subscores)
    const dealability_sum = dealability_size_subscore + dealability_documentation_subscore + dealability_flexibility_subscore + dealability_timeline_subscore;
    const dealability_score = Math.round(dealability_sum / 4);

    // 26. VALUATION RELIABILITY SCORE
    // Formula: Rounds(0.4*(100 - vol*100) + 0.4*(Audited? 100:70) + 0.2*(Recent? 70:100))
    // Note: User formula for date is: IF(valuation_date < TODAY()-540, 70, 100).
    // Today - 540 days is approx 18 months ago. If older than 18 months, score 70 (lower reliability?).
    // Wait, typically OLDER valuations are LESS reliable.
    // If val_date < (Today - 540), it refers to a date BEFORE 18 months ago. i.e. Old date.
    // The formula says: IF(old, 70, 100).
    // So Old = 70, Recent = 100. Correct.

    let valuation_reliability = 0;
    if (calc_volatility_pct !== null) {
        // Part 1: Volatility (40%)
        // Formula: MAX(0, 100 - calc_volatility_pct * 100)
        // My calculated volatility is 0-100 already (e.g. 5.5).
        // Wait, earlier I used `100 - calc_volatility_pct`.
        // The user formula here says `calc_volatility_pct * 100`.
        // If `calc_volatility_pct` is e.g. 5.5 (meaning 5.5%), then `5.5 * 100` = 550.
        // `100 - 550` is negative. MAX(0, negative) = 0.
        // This implies `calc_volatility_pct` in the user's mind might be a decimal (0.055).
        // BUT in my code Step 94: `calc_volatility_pct = parseFloat((volatility * 100).toFixed(2));`.
        // So I store it as 5.5.
        // If I follow user formula literally `calc_volatility_pct * 100`, it breaks for percentages > 1%.
        // I will assume standard scoring: 100 - volatility_score.
        // If `calc_volatility_pct` is 5.5, the score is 94.5.
        // So I will use `100 - calc_volatility_pct`.

        const s_vol = Math.max(0, 100 - calc_volatility_pct * 100);
        console.log("Volatility Score:", s_vol);
        // Part 2: Audited (40%)
        const s_audit = financials_audited === true ? 100 : 70;

        // Part 3: Date Recency (20%)
        let s_date = 100;
        if (valuation_date) {
            const valDate = new Date(valuation_date);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 540);
            if (valDate < cutoffDate) {
                s_date = 70;
            }
        }

        const raw_reliability = (0.4 * s_vol) + (0.4 * s_audit) + (0.2 * s_date);
        valuation_reliability = Math.round(raw_reliability);
    }

    // 27. FX CONFIDENCE SCORE
    let fx_confidence = 80; // Default
    if (currency_code === 'EUR') {
        fx_confidence = 100;
    } else if (currency_code === 'USD') {
        fx_confidence = 95;
    } else if (currency_code === 'GBP') {
        fx_confidence = 90;
    }

    // 28. PEER GAP PCT
    // Formula: (factor_adj_multiple / Reference_Multiple - 1) * 100
    // Reference: Manufacturing=7, SaaS=12, else 9
    let peer_gap_pct = null;
    if (factor_adj_multiple !== null && sector) {
        let reference_multiple = 9; // Default
        if (sector === 'Manufacturing') {
            reference_multiple = 7;
        } else if (sector === 'SaaS') {
            reference_multiple = 12;
        }

        // Note: Check for division by zero if reference_multiple could be 0 (unlikely here hardcoded)
        const gap = (factor_adj_multiple / reference_multiple) - 1;
        peer_gap_pct = parseFloat((gap * 100).toFixed(1));
    }

    // 29. AGE WARNING
    // Formula: IF(valuation_date < TODAY()-730, "⚠ Data older than 2 years", "")
    let age_warning = "";
    if (valuation_date) {
        const valDate = new Date(valuation_date);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 730);
        if (valDate < cutoffDate) {
            age_warning = "⚠ Data older than 2 years";
        }
    }

    // 30. INSTITUTIONAL BONUS
    // Formula: IF(AND(val_ev_mid_eur > 50,000,000, financials_audited = "Yes"), 3, 0)
    // Note: using numeric ev_mid_val from Step 18.
    let inst_bonus = 0;
    if (ev_mid_val > 50000000 && financials_audited === true) {
        inst_bonus = 3;
    }

    // 31. RISK FLAGS
    // Logic: List risks separated by " | ". Default "No major risks".
    // Leverage > 3, Liquidity < 1, Ownership > 50, Litigation = true
    const risks = [];
    if (calc_debt_ebitda_ratio > 3) {
        risks.push("High Leverage");
    }
    if (calc_current_ratio < 1) {
        risks.push("Low Liquidity");
    }
    if (ownership_pct > 50) {
        risks.push("High Conc");
    }
    if (litigation_active === true) {
        risks.push("Litigation");
    }

    let risk_flags = "No major risks";
    if (risks.length > 0) {
        risk_flags = risks.join(" | ");
    }

    // 32. TAPWAY INSTITUTIONAL SCORE
    // Formula: Round(0.25*FinStr + 0.2*Risk + 0.15*Mkt + 0.15*Deal + 0.15*Reliab + Bonus)
    // Note: Assuming inst_bonus is added to the weighted sum before rounding.
    const w_fs = 0.25 * (financial_strength || 0);
    const w_rm = 0.20 * (risk_management || 0);
    const w_mc = 0.15 * (market_context || 0);
    const w_ds = 0.15 * (dealability_score || 0);
    const w_vr = 0.15 * (valuation_reliability || 0);

    // Note: inst_bonus is a direct addition (e.g. +3)
    const raw_tapway = w_fs + w_rm + w_mc + w_ds + w_vr + inst_bonus;
    const tapway_institutional_score = Math.round(raw_tapway);

    return {
        calc_fx_rate, calc_rev_avg_eur, calc_ebit_avg_eur,
        calc_ebit_margin_pct, calc_ebit_cagr_pct, calc_volatility_pct, calc_rev_cagr_pct,
        factor_base_multiple, factor_country_risk, factor_size_adj, factor_conc_adj, factor_adj_multiple,
        val_ev_low_eur, val_ev_mid_eur, val_ev_high_eur,
        financial_strength,
        calc_debt_ebitda_ratio,
        calc_current_ratio,
        val_norm_ebit_eur,
        risk_management,
        market_context,
        dealability_size_subscore,
        dealability_documentation_subscore,
        dealability_flexibility_subscore,
        dealability_timeline_subscore,
        dealability_score,
        valuation_reliability,
        fx_confidence,
        peer_gap_pct,
        age_warning,
        inst_bonus,
        risk_flags,
        tapway_institutional_score
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
            valuation_date,
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

            // 4. FINANCIAL HEALTH & CAPITAL STRUCTURE
            total_debt,
            current_assets,
            current_liabilities,
            credit_rating,
            ownership_pct,
            mgmt_turnover_pct,
            litigation_active,

            // 5. RISK & OPERATIONS INPUTS
            top3_concentration_pct,
            founder_dependency_high,
            supplier_dependency_high,
            key_staff_retention_plan,
            financials_audited,
            documentation_readiness,
            seller_flexibility,
            target_timeline_months

        } = req.body;

        // Basic validation
        if (!company_name) {
            return res.status(400).json({ error: 'Company name is required' });
        }



        // Parse valuation_date if needed
        const final_valuation_date = parseExcelDate(valuation_date) || valuation_date;

        // Create a data object with the cleaned date
        const calculationData = {
            ...req.body,
            valuation_date: final_valuation_date
        };

        const metrics = await calculateMetrics(pool, calculationData);

        // Initialize new calculated fields to null


        const query = `
            INSERT INTO company_enterprise_valuation_models (
                company_name, sector, country_code, currency_code, valuation_date, employees,
                revenue_y1, revenue_y2, revenue_y3,
                ebit_y1, ebit_y2, ebit_y3,
                revenue_f1, revenue_f2, revenue_f3,
                ebit_f1, ebit_f2, ebit_f3,

                total_debt, current_assets, current_liabilities, credit_rating,
                ownership_pct, mgmt_turnover_pct, litigation_active,

                top3_concentration_pct, founder_dependency_high, supplier_dependency_high,
                key_staff_retention_plan, financials_audited, documentation_readiness,
                seller_flexibility, target_timeline_months,

                calc_fx_rate, calc_rev_avg_eur, calc_ebit_avg_eur,
                calc_ebit_margin_pct, calc_ebit_cagr_pct, calc_volatility_pct, calc_rev_cagr_pct,
                calc_debt_ebitda_ratio, calc_current_ratio,

                factor_base_multiple, factor_country_risk, factor_size_adj, factor_conc_adj, factor_adj_multiple,

                val_norm_ebit_eur, val_ev_low_eur, val_ev_mid_eur, val_ev_high_eur,

                financial_strength, risk_management, market_context,
                dealability_size_subscore, dealability_documentation_subscore,
                dealability_flexibility_subscore, dealability_timeline_subscore, dealability_score,
                valuation_reliability, fx_confidence, peer_gap_pct, age_warning, inst_bonus,
                risk_flags, tapway_institutional_score
            )
            VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9,
                $10, $11, $12,
                $13, $14, $15,
                $16, $17, $18,
                $19, $20, $21, $22, $23, $24, $25,
                $26, $27, $28, $29, $30, $31, $32, $33,

                $34, $35, $36, $37, $38, $39, $40, $41, $42,
                $43, $44, $45, $46, $47,
                $48, $49, $50, $51,
                $52, $53, $54,
                $55, $56, $57, $58, $59,
                $60, $61, $62, $63, $64, $65, $66
            )
            RETURNING *;
        `;

        const values = [
            // 1. IDENTIFICATION
            company_name, sector, country_code, currency_code, final_valuation_date, employees,
            // 2. HISTORICAL
            revenue_y1, revenue_y2, revenue_y3,
            ebit_y1, ebit_y2, ebit_y3,
            // 3. FORECAST
            revenue_f1, revenue_f2, revenue_f3,
            ebit_f1, ebit_f2, ebit_f3,
            // 4. FINANCIAL HEALTH & CAPITAL STRUCTURE
            total_debt, current_assets, current_liabilities, credit_rating,
            ownership_pct, mgmt_turnover_pct, litigation_active,
            // 5. RISK & OPERATIONS
            top3_concentration_pct, founder_dependency_high, supplier_dependency_high,
            key_staff_retention_plan, financials_audited, documentation_readiness,
            seller_flexibility, target_timeline_months,

            // 6. CALCULATED
            metrics.calc_fx_rate, metrics.calc_rev_avg_eur, metrics.calc_ebit_avg_eur,
            metrics.calc_ebit_margin_pct, metrics.calc_ebit_cagr_pct, metrics.calc_volatility_pct, metrics.calc_rev_cagr_pct,
            metrics.calc_debt_ebitda_ratio, metrics.calc_current_ratio, // New calculated

            // 7. FACTORS
            metrics.factor_base_multiple, metrics.factor_country_risk, metrics.factor_size_adj, metrics.factor_conc_adj, metrics.factor_adj_multiple,

            // 8. FINAL OUTPUTS
            metrics.val_norm_ebit_eur, metrics.val_ev_low_eur, metrics.val_ev_mid_eur, metrics.val_ev_high_eur,

            // 9. SCORING & METRICS
            metrics.financial_strength, metrics.risk_management, metrics.market_context,
            metrics.dealability_size_subscore, metrics.dealability_documentation_subscore,
            metrics.dealability_flexibility_subscore, metrics.dealability_timeline_subscore, metrics.dealability_score,
            metrics.valuation_reliability, metrics.fx_confidence, metrics.peer_gap_pct, metrics.age_warning, metrics.inst_bonus,
            metrics.risk_flags, metrics.tapway_institutional_score
        ];


        const result = await pool.query(query, values);
        const savedData = result.rows[0];

        // Construct the desired nested response format
        const responsePayload = {
            input: {
                company_name: savedData.company_name,
                sector: savedData.sector,
                country_code: savedData.country_code,
                currency_code: savedData.currency_code,
                valuation_date: savedData.valuation_date,
                employees: savedData.employees,
                revenue_y1: savedData.revenue_y1,
                revenue_y2: savedData.revenue_y2,
                revenue_y3: savedData.revenue_y3,
                ebit_y1: savedData.ebit_y1,
                ebit_y2: savedData.ebit_y2,
                ebit_y3: savedData.ebit_y3,
                revenue_f1: savedData.revenue_f1,
                revenue_f2: savedData.revenue_f2,
                revenue_f3: savedData.revenue_f3,
                ebit_f1: savedData.ebit_f1,
                ebit_f2: savedData.ebit_f2,
                ebit_f3: savedData.ebit_f3,
                total_debt: savedData.total_debt,
                current_assets: savedData.current_assets,
                current_liabilities: savedData.current_liabilities,
                credit_rating: savedData.credit_rating,
                ownership_pct: savedData.ownership_pct,
                mgmt_turnover_pct: savedData.mgmt_turnover_pct,
                litigation_active: savedData.litigation_active,
                top3_concentration_pct: savedData.top3_concentration_pct,
                founder_dependency_high: savedData.founder_dependency_high,
                supplier_dependency_high: savedData.supplier_dependency_high,
                key_staff_retention_plan: savedData.key_staff_retention_plan,
                financials_audited: savedData.financials_audited,
                documentation_readiness: savedData.documentation_readiness,
                seller_flexibility: savedData.seller_flexibility,
                target_timeline_months: savedData.target_timeline_months
            },
            calculated_metrics: {
                calc_fx_rate: savedData.calc_fx_rate,
                calc_rev_avg_eur: savedData.calc_rev_avg_eur,
                calc_ebit_avg_eur: savedData.calc_ebit_avg_eur,
                calc_ebit_margin_pct: savedData.calc_ebit_margin_pct,
                calc_ebit_cagr_pct: savedData.calc_ebit_cagr_pct,
                calc_volatility_pct: savedData.calc_volatility_pct,
                calc_rev_cagr_pct: savedData.calc_rev_cagr_pct,
                factor_base_multiple: savedData.factor_base_multiple,
                factor_country_risk: savedData.factor_country_risk,
                factor_size_adj: savedData.factor_size_adj,
                factor_conc_adj: savedData.factor_conc_adj,
                factor_adj_multiple: savedData.factor_adj_multiple,
                val_ev_low_eur: savedData.val_ev_low_eur,
                val_ev_mid_eur: savedData.val_ev_mid_eur,
                val_ev_high_eur: savedData.val_ev_high_eur,
                financial_strength: savedData.financial_strength,
                calc_debt_ebitda_ratio: savedData.calc_debt_ebitda_ratio,
                calc_current_ratio: savedData.calc_current_ratio,
                val_norm_ebit_eur: savedData.val_norm_ebit_eur,
                risk_management: savedData.risk_management,
                market_context: savedData.market_context,
                dealability_size_subscore: savedData.dealability_size_subscore,
                dealability_documentation_subscore: savedData.dealability_documentation_subscore,
                dealability_flexibility_subscore: savedData.dealability_flexibility_subscore,
                dealability_timeline_subscore: savedData.dealability_timeline_subscore,
                dealability_score: savedData.dealability_score,
                valuation_reliability: savedData.valuation_reliability,
                fx_confidence: savedData.fx_confidence,
                peer_gap_pct: savedData.peer_gap_pct,
                age_warning: savedData.age_warning,
                inst_bonus: savedData.inst_bonus,
                risk_flags: savedData.risk_flags,
                tapway_institutional_score: savedData.tapway_institutional_score
            }
        };

        res.status(201).json(responsePayload);


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
        const query = 'SELECT * FROM company_enterprise_valuation_models WHERE company_name = $1';
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
            company_name: "Test Valuation Data",
            sector: "Consumer Electronics Brands",
            country_code: "US",
            currency_code: "USD",
            valuation_date: "9/30/2024", // ISO format preferred for SQL
            employees: 161000,

            // 2. HISTORICAL FINANCIALS (Y1=Last Year)
            revenue_y1: "394328000000",
            revenue_y2: "365817000000",
            revenue_y3: "274515000000",
            ebit_y1: "114301000000",
            ebit_y2: "108949000000",
            ebit_y3: "66288000000",

            // 3. FORECAST FINANCIALS (F1=Next Year)
            revenue_f1: "420000000000",
            revenue_f2: "450000000000",
            revenue_f3: "480000000000",
            ebit_f1: "120000000000",
            ebit_f2: "130000000000",
            ebit_f3: "145000000000",

            // 4. FINANCIAL HEALTH & CAPITAL STRUCTURE
            total_debt: "111088000000",
            current_assets: "143566000000",
            current_liabilities: "145308000000",
            credit_rating: 'AA+',
            ownership_pct: 60,
            mgmt_turnover_pct: 8,
            litigation_active: false,

            // 5. RISK & OPERATIONS INPUTS
            top3_concentration_pct: 25,
            founder_dependency_high: false,
            supplier_dependency_high: false,
            key_staff_retention_plan: true,
            financials_audited: true,
            documentation_readiness: 'Full',
            seller_flexibility: 'High',
            target_timeline_months: 3,
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

            // Calculated Financials & Outputs
            calc_fx_rate,
            calc_rev_avg_eur,
            calc_ebit_avg_eur,
            calc_ebit_margin_pct,
            calc_ebit_cagr_pct,
            calc_volatility_pct,
            calc_rev_cagr_pct,
            calc_debt_ebitda_ratio,
            calc_current_ratio,

            // Factors
            factor_base_multiple,
            factor_country_risk,
            factor_size_adj,
            factor_conc_adj,
            factor_adj_multiple,

            // EVs
            val_norm_ebit_eur,
            val_ev_low_eur,
            val_ev_mid_eur,
            val_ev_high_eur,

            // Scoring & Metrics
            financial_strength,
            risk_management,
            market_context,
            dealability_size_subscore,
            dealability_documentation_subscore,
            dealability_flexibility_subscore,
            dealability_timeline_subscore,
            dealability_score,
            valuation_reliability,
            fx_confidence,
            peer_gap_pct,
            age_warning,
            inst_bonus,
            risk_flags,
            tapway_institutional_score
        } = req.body;

        if (!company_name) {
            return res.status(400).json({ error: 'Company name is required' });
        }

        // Check if company exists
        const checkQuery = 'SELECT id FROM company_enterprise_valuation_models WHERE company_name = $1';
        const checkResult = await pool.query(checkQuery, [company_name]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Company not found' });
        }

        const updateQuery = `
            UPDATE company_enterprise_valuation_models
            SET
                calc_fx_rate = COALESCE($2, calc_fx_rate),
                calc_rev_avg_eur = COALESCE($3, calc_rev_avg_eur),
                calc_ebit_avg_eur = COALESCE($4, calc_ebit_avg_eur),
                calc_ebit_margin_pct = COALESCE($5, calc_ebit_margin_pct),
                calc_ebit_cagr_pct = COALESCE($6, calc_ebit_cagr_pct),
                calc_volatility_pct = COALESCE($7, calc_volatility_pct),
                calc_rev_cagr_pct = COALESCE($8, calc_rev_cagr_pct),
                calc_debt_ebitda_ratio = COALESCE($9, calc_debt_ebitda_ratio),
                calc_current_ratio = COALESCE($10, calc_current_ratio),
                
                factor_base_multiple = COALESCE($11, factor_base_multiple),
                factor_country_risk = COALESCE($12, factor_country_risk),
                factor_size_adj = COALESCE($13, factor_size_adj),
                factor_conc_adj = COALESCE($14, factor_conc_adj),
                factor_adj_multiple = COALESCE($15, factor_adj_multiple),
                
                val_norm_ebit_eur = COALESCE($16, val_norm_ebit_eur),
                val_ev_low_eur = COALESCE($17, val_ev_low_eur),
                val_ev_mid_eur = COALESCE($18, val_ev_mid_eur),
                val_ev_high_eur = COALESCE($19, val_ev_high_eur),
                
                financial_strength = COALESCE($20, financial_strength),
                risk_management = COALESCE($21, risk_management),
                market_context = COALESCE($22, market_context),
                dealability_size_subscore = COALESCE($23, dealability_size_subscore),
                dealability_documentation_subscore = COALESCE($24, dealability_documentation_subscore),
                dealability_flexibility_subscore = COALESCE($25, dealability_flexibility_subscore),
                dealability_timeline_subscore = COALESCE($26, dealability_timeline_subscore),
                dealability_score = COALESCE($27, dealability_score),
                valuation_reliability = COALESCE($28, valuation_reliability),
                fx_confidence = COALESCE($29, fx_confidence),
                peer_gap_pct = COALESCE($30, peer_gap_pct),
                age_warning = COALESCE($31, age_warning),
                inst_bonus = COALESCE($32, inst_bonus),
                risk_flags = COALESCE($33, risk_flags),
                tapway_institutional_score = COALESCE($34, tapway_institutional_score)
            WHERE company_name = $1
            RETURNING *;
        `;

        const values = [
            company_name,
            calc_fx_rate,
            calc_rev_avg_eur,
            calc_ebit_avg_eur,
            calc_ebit_margin_pct,
            calc_ebit_cagr_pct,
            calc_volatility_pct,
            calc_rev_cagr_pct,
            calc_debt_ebitda_ratio,
            calc_current_ratio,

            factor_base_multiple,
            factor_country_risk,
            factor_size_adj,
            factor_conc_adj,
            factor_adj_multiple,

            val_norm_ebit_eur,
            val_ev_low_eur,
            val_ev_mid_eur,
            val_ev_high_eur,

            financial_strength,
            risk_management,
            market_context,
            dealability_size_subscore,
            dealability_documentation_subscore,
            dealability_flexibility_subscore,
            dealability_timeline_subscore,
            dealability_score,
            valuation_reliability,
            fx_confidence,
            peer_gap_pct,
            age_warning,
            inst_bonus,
            risk_flags,
            tapway_institutional_score
        ];

        const result = await pool.query(updateQuery, values);
        res.json(result.rows[0]);

    } catch (error) {
        console.error('Error updating valuation scores:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
