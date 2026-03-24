const xlsx = require('xlsx');
const path = require('path');
const { Pool } = require('pg');

// Configure your database connection
const connectionString = 'postgresql://neondb_owner:npg_8M7FuxlWGsBi@ep-tiny-moon-ai15nmho-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

const filePath = "/Users/afnanhassan/Downloads/3. Enterprise Version dataset_60 dataset_V2.xlsx";

// ---------------------------------------------------------
// 1. HEADERS TO IGNORE
// ---------------------------------------------------------
// These are the columns at the end of the sheet that are NOT companies
const IGNORED_HEADERS = [
    'Primary Source',
    'Secondary / Validation Source',
    'Data Nature',
    'Notes',
    'Model Reference Date'
];

const METRIC_MAP = {
    // 1. IDENTIFICATION
    "Sector": "sector",
    "Country": "country_code",
    "Currency": "currency_code",
    "Val Date": "valuation_date",
    "Employees": "employees",

    // 2. HISTORICAL FINANCIALS
    "Revenue Y1": "revenue_y1",
    "Revenue Y2": "revenue_y2",
    "Revenue Y3": "revenue_y3",
    "EBIT Y1": "ebit_y1",
    "EBIT Y2": "ebit_y2",
    "EBIT Y3": "ebit_y3",

    // 3. FORECAST FINANCIALS
    "Revenue F1": "revenue_f1",
    "Revenue F2": "revenue_f2",
    "Revenue F3": "revenue_f3",
    "EBIT F1": "ebit_f1",
    "EBIT F2": "ebit_f2",
    "EBIT F3": "ebit_f3",

    // 4. FINANCIAL HEALTH
    "Total Debt": "total_debt",
    "Current Assets": "current_assets",
    "Current Liabilities": "current_liabilities",
    "Credit Rating": "credit_rating",
    "Ownership %": "ownership_pct",
    "Mgmt Turnover %": "mgmt_turnover_pct",
    "Litigation?": "litigation_active",

    // 5. RISK & OPERATIONS INPUTS
    "Top-3 %": "top3_concentration_pct",
    "Founder dep?": "founder_dependency_high",
    "Supplier dep?": "supplier_dependency_high",
    "Staff plan?": "key_staff_retention_plan",
    "Audited?": "financials_audited",
    "Documentation": "documentation_readiness",
    "Flexibility?": "seller_flexibility",
    "Timeline": "target_timeline_months"
};

/**
 * Parses Excel date serial numbers to 'YYYY-MM-DD'
 * Added Safety Check: Returns NULL if the value is not a valid date format.
 */
function parseExcelDate(value) {
    if (!value) return null;

    // Case A: Excel Serial Number (e.g., 45321)
    if (typeof value === 'number') {
        const excelBaseDate = new Date(1899, 11, 30);
        const date = new Date(excelBaseDate.getTime() + value * 24 * 60 * 60 * 1000);
        return date.toISOString().split('T')[0];
    }

    // Case B: String date (e.g. "2024-09-30")
    if (typeof value === 'string') {
        // If it contains "Reference Date" or isn't a date string, return null
        if (value.length > 20 || isNaN(Date.parse(value))) {
            return null;
        }
        return value;
    }

    return null;
}

function cleanNumber(value) {
    if (typeof value === 'string') {
        return parseFloat(value.replace(/,/g, ''));
    }
    return value;
}

function parseBoolean(value) {
    if (typeof value === 'string') {
        const lower = value.toLowerCase().trim();
        if (lower === 'yes' || lower === 'true') return true;
        if (lower === 'no' || lower === 'false') return false;
    }
    return !!value;
}

async function seedData() {
    const client = await pool.connect();
    try {
        console.log('Reading Excel file...');
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

        // --- DYNAMIC HEADER FINDER ---
        let headerRowIndex = -1;
        for (let i = 0; i < 20; i++) {
            if (rawData[i] && rawData[i][0] === 'Metric') {
                headerRowIndex = i;
                console.log(`Found header "Metric" at row index ${i}`);
                break;
            }
        }

        if (headerRowIndex === -1) {
            console.error("❌ Could not find the 'Metric' header row.");
            return;
        }

        const headerRow = rawData[headerRowIndex];

        // --- REFINED COMPANY FINDER ---
        const companyIndices = {};
        for (let i = 1; i < headerRow.length; i++) {
            const header = headerRow[i];

            // Check if header exists, is a string, and IS NOT in our ignore list
            if (header && typeof header === 'string') {
                if (!IGNORED_HEADERS.includes(header)) {
                    companyIndices[header] = i;
                }
            }
        }

        const companyCount = Object.keys(companyIndices).length;
        console.log(`Found ${companyCount} companies.`);

        if (companyCount !== 60) {
            console.warn(`⚠️ WARNING: Expected 60 companies, but found ${companyCount}. Check the IGNORED_HEADERS list if this is incorrect.`);
        }

        // Build Data Object
        const companiesData = {};
        Object.keys(companyIndices).forEach(comp => companiesData[comp] = {});

        for (let i = headerRowIndex + 1; i < rawData.length; i++) {
            const row = rawData[i];
            const metricLabel = row[0];

            if (METRIC_MAP[metricLabel]) {
                const sqlColumn = METRIC_MAP[metricLabel];
                for (const [companyName, colIndex] of Object.entries(companyIndices)) {
                    let val = row[colIndex];
                    companiesData[companyName][sqlColumn] = val;
                }
            }
        }

        console.log('Starting DB Insertion...');
        await client.query('BEGIN');

        for (const [companyName, data] of Object.entries(companiesData)) {
            // Prepare payload for API
            // The API expects keys like 'revenue_y1', etc. which we already have in `data`.
            // We just need to ensure types match what the API expects.

            const payload = {
                company_name: companyName,
                ...data
            };

            // Basic cleaning for API consumption
            if (payload.valuation_date) payload.valuation_date = parseExcelDate(payload.valuation_date);

            // Clean booleans and numbers for the payload
            ['litigation_active', 'founder_dependency_high', 'supplier_dependency_high', 'key_staff_retention_plan', 'financials_audited'].forEach(k => {
                if (payload[k] !== undefined) payload[k] = parseBoolean(payload[k]);
            });

            // Clean numbers (remove commas)
            Object.keys(payload).forEach(k => {
                if (typeof payload[k] === 'string' && !isNaN(parseFloat(payload[k].replace(/,/g, '')))) {
                    if (!['sector', 'country_code', 'currency_code', 'credit_rating', 'documentation_readiness', 'seller_flexibility', 'company_name', 'valuation_date'].includes(k)) {
                        payload[k] = cleanNumber(payload[k]);
                    }
                }
            });

            // Send POST request to local API
            try {
                const response = await fetch('http://localhost:3000/api/enterprise-valuations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    process.stdout.write('.');
                } else {
                    const errText = await response.text();
                    console.error(`\nFailed for ${companyName}: ${response.status} ${response.statusText} - ${errText}`);
                }
            } catch (fetchErr) {
                console.error(`\nError sending to API for ${companyName}:`, fetchErr.message);
            }
        }

        console.log('\n✅ Seed process via API completed!');

    } catch (err) {
        console.error('\n❌ Seed failed:', err);
    }
    // No need to close pool manually since we are using API, 
    // but the script opened it at start. 
    // We can actually remove the PG pool usage entirely if we only use API.
    // However, I'll validly close it.
    await pool.end();
}

seedData();