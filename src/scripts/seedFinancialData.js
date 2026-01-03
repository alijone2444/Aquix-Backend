const xlsx = require('xlsx');
const path = require('path');
const pool = require('../db');

const filePath = 'f:/JOBS/Aquix/3. Enterprise Version dataset_Jay\'2 inputs.xlsx';

// Metric name to database column mapping
const METRIC_MAP = {
    "Sector": "sector",
    "Country": "country",
    "Currency": "currency",
    "Val Date": "val_date",
    "Employees": "employees",
    "Revenue Y1": "revenue_y1",
    "Revenue Y2": "revenue_y2",
    "Revenue Y3": "revenue_y3",
    "EBIT Y1": "ebit_y1",
    "EBIT Y2": "ebit_y2",
    "EBIT Y3": "ebit_y3",
    "Revenue F1": "revenue_f1",
    "Revenue F2": "revenue_f2",
    "Revenue F3": "revenue_f3",
    "EBIT F1": "ebit_f1",
    "EBIT F2": "ebit_f2",
    "EBIT F3": "ebit_f3",
    "Total Debt": "total_debt",
    "Current Assets": "current_assets",
    "Current Liabilities": "current_liabilities",
    "Credit Rating": "credit_rating",
    "Ownership %": "ownership_percent",
    "Mgmt Turnover %": "mgmt_turnover_percent",
    "Litigation?": "litigation",
    "Top-3 %": "top_3_percent",
    "Founder dep?": "founder_dep",
    "Supplier dep?": "supplier_dep",
    "Staff plan?": "staff_plan",
    "Audited?": "audited",
    "Documentation": "documentation",
    "Flexibility?": "flexibility",
    "Timeline": "timeline",
    "FX": "fx",
    "Rev AVG - Historical": "rev_avg_historical",
    "EBIT AVG - Historical": "ebit_avg_historical",
    "Margin %": "margin_percent",
    "EBIT CAGR %": "ebit_cagr_percent",
    "Volatility %": "volatility_percent",
    "Rev CAGR %": "rev_cagr_percent",
    "Debt/EBITDA": "debt_ebitda",
    "Current Ratio": "current_ratio",
    "Base Multiple Factor": "base_multiple_factor",
    "Country Risk Factor": "country_risk_factor",
    "Size Adjustment Factor": "size_adjustment_factor",
    "Customer Concentration Adjustment": "customer_concentration_adjustment",
    "Adj Mult": "adj_mult",
    "Norm EBIT": "norm_ebit",
    "EV mid": "ev_mid",
    "EV low": "ev_low",
    "EV high": "ev_high",
    "Financial Strength": "financial_strength",
    "Risk Management": "risk_management",
    "Market Context": "market_context",
    "Dealability (Size) subscore": "dealability_size_subscore",
    "Dealability (Documentation) subscore": "dealability_documentation_subscore",
    "Dealability (Flexibility) subscore": "dealability_flexibility_subscore",
    "Dealability (Timeline) subscore": "dealability_timeline_subscore",
    "Dealability Score (0–100)": "dealability_score",
    "Valuation Reliability": "valuation_reliability",
    "FX Confidence": "fx_confidence",
    "Peer Gap %": "peer_gap_percent",
    "Age Warning": "age_warning",
    "Inst Bonus": "inst_bonus",
    "Risk Flags": "risk_flags",
    "TAPWAY INSTITUTIONAL SCORE": "tapway_institutional_score",
    "Narrative": "narrative"
};

// Map for company_constants table
// Format: DB_COLUMN: EXCEL_METRIC_NAME
const CONSTANTS_MAP = {
    "base": "Norm EBIT",
    "country": "Country",
    "risk_factor": "Country Risk Factor",
    "size": "Dealability (Size) subscore",
    "adjustment_factor": "Size Adjustment Factor",
    "customer": "Top-3 %",
    "customer_concentration_adjustment": "Customer Concentration Adjustment"
};

/**
 * Basic helper to parse Excel date
 * Excel stores dates as serial numbers (days since 1900-01-01)
 */
function parseExcelDate(value) {
    if (!value) return null;
    if (typeof value === 'number') {
        // Basic conversion from Excel serial date to JS Date
        // Excel base date: Dec 30 1899
        const excelBaseDate = new Date(1899, 11, 30);
        const date = new Date(excelBaseDate.getTime() + value * 24 * 60 * 60 * 1000);
        return date.toISOString().split('T')[0]; // Format YYYY-MM-DD
    }
    return value; // Assume it's already a string or text date
}

/**
 * Clean numeric string "12,000,000" -> 12000000
 */
function cleanNumber(value) {
    if (typeof value === 'string') {
        return parseFloat(value.replace(/,/g, ''));
    }
    return value;
}

async function seedData() {
    try {
        console.log('Reading Excel file...');
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Read as array of arrays
        const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

        // Identify Structure
        // Row 6 (index 6) has headers: "Metric", "Company A", "Company B", etc.
        const headerRowIndex = 6;
        const headerRow = rawData[headerRowIndex];

        // Find Company Columns (indices)
        const companyIndices = {};
        for (let i = 1; i < headerRow.length; i++) {
            const header = headerRow[i];
            if (header && typeof header === 'string' && header.toLowerCase().includes('company')) {
                companyIndices[header] = i;
            }
        }

        console.log(`Found ${Object.keys(companyIndices).length} companies:`, Object.keys(companyIndices));

        // Build data object per company
        // Structure: { "Company A": { "Sector": "Manufacturing", ... }, ... }
        const companiesData = {};
        Object.keys(companyIndices).forEach(company => {
            companiesData[company] = {};
        });

        // Iterate rows starting after header
        for (let i = headerRowIndex + 1; i < rawData.length; i++) {
            const row = rawData[i];
            const metricName = row[0]; // First column is metric name

            if (!metricName) continue;

            // Populate data for each company
            for (const [companyName, colIndex] of Object.entries(companyIndices)) {
                let value = row[colIndex];

                // Clean value (undefined check)
                if (value === undefined) value = null;

                companiesData[companyName][metricName] = value;
            }
        }

        // Insert into Database
        console.log('Starting DB Insertion...');
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Clear existing data (optional, but good for idempotent seed)
            // await client.query('TRUNCATE TABLE company_financial_data, company_constants RESTART IDENTITY');

            for (const companyName of Object.keys(companiesData)) {
                const data = companiesData[companyName];

                console.log(`Processing ${companyName}...`);

                // 1. Insert into company_constants
                const constQuery = `
                INSERT INTO company_constants (
                    company_name, base, country, risk_factor, size, adjustment_factor, customer, customer_concentration_adjustment
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id;
            `;

                const constValues = [
                    companyName,
                    cleanNumber(data[CONSTANTS_MAP.base]),
                    data[CONSTANTS_MAP.country],
                    cleanNumber(data[CONSTANTS_MAP.risk_factor]),
                    cleanNumber(data[CONSTANTS_MAP.size]),
                    cleanNumber(data[CONSTANTS_MAP.adjustment_factor]),
                    cleanNumber(data[CONSTANTS_MAP.customer]),
                    cleanNumber(data[CONSTANTS_MAP.customer_concentration_adjustment])
                ];

                await client.query(constQuery, constValues);

                // 2. Insert into company_financial_data
                const finColumns = ['company_name'];
                const finValues = [companyName];
                const finPlaceholders = ['$1'];

                let pIndex = 2;

                for (const [metric, dbCol] of Object.entries(METRIC_MAP)) {
                    if (data.hasOwnProperty(metric)) {
                        finColumns.push(dbCol);

                        let val = data[metric];
                        if (dbCol === 'val_date') {
                            val = parseExcelDate(val);
                        } else if (typeof val === 'number' || (typeof val === 'string' && !isNaN(parseFloat(val)) && dbCol !== 'sector' && dbCol !== 'company_name')) {
                            // Attempt to keep numbers as numbers, but respect schema types (most are numeric)
                            // Don't auto-convert strings if they are meant to be text like 'litigation'
                            // But 'employees' is number.
                            // Simple check: if schema expects number, clean it?
                            // For now, rely on PG driver to cast unless it involves commas.
                            val = cleanNumber(val);
                        }

                        finValues.push(val);
                        finPlaceholders.push(`$${pIndex}`);
                        pIndex++;
                    }
                }

                const finQuery = `
                INSERT INTO company_financial_data (${finColumns.join(', ')})
                VALUES (${finPlaceholders.join(', ')})
            `;

                await client.query(finQuery, finValues);
            }

            await client.query('COMMIT');
            console.log('✅ Seed completed successfully!');

        } catch (e) {
            await client.query('ROLLBACK');
            console.error('❌ Transaction failed:', e);
            throw e;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Seed Error:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

seedData();
