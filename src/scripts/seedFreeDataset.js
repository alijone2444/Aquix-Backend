const xlsx = require('xlsx');
const { Pool } = require('pg');

// Configure your database connection
const connectionString = 'postgresql://neondb_owner:npg_dv5xH2VfFAgJ@ep-floral-surf-a4a6j6xp-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

// UPDATED: File path for the Free Version
const filePath = "/Users/afnanhassan/Downloads/1.\ Free\ Version\ dataset_Jay\'2\ inputs_60\ dataset.xlsx"

// ---------------------------------------------------------
// 1. HEADERS TO IGNORE
// ---------------------------------------------------------
const IGNORED_HEADERS = [
    'User Inputs',
    'Blue Cells',
    'Calculated Fields',
    'Green Cells',
    'Yellow Cells',
    'Details/Remarks/Calculation'
];

// ---------------------------------------------------------
// 2. METRIC MAP (Adapted for Free Version)
// ---------------------------------------------------------
const METRIC_MAP = {
    // 1. INPUTS
    "Industry/Sector": "sector",
    "Country/Region": "country",
    "Annual Revenue": "annual_revenue",
    "EBIT (Operating Profit)": "ebit",
    "Currency": "currency",
    "Number of Employees (Optional)": "employees",
    "Top 3 Customers % (Optional)": "top3_customers_pct",

    // 2. BACKEND CALCULATIONS
    "FX Rate to EUR": "calc_fx_rate_to_eur",
    "EBIT (EUR)": "calc_ebit_eur",
    "Base EBIT Multiple": "factor_base_ebit_multiple",
    "Country Risk Factor": "factor_country_risk",
    "Size Adjustment Factor": "factor_size_adj",
    "Customer Concentration Adjustment": "factor_conc_adj",

    // 3. VALUATION OUTPUT
    "Calculated Adjusted Multiple": "val_calc_adj_multiple",
    "Enterprise Value (Mid-point)": "val_ev_mid",
    "Enterprise Value (Mid-point) (000 EUR)": "val_ev_mid_eur_k",
    "Low (Calculated)": "val_ev_low",
    "Low (Calculated) (000 EUR)": "val_ev_low_eur_k",
    "High (Calculated)": "val_ev_high",
    "High (Calculated) (000 EUR)": "val_ev_high_eur_k",

    // 4. SCORING & CHECKS
    "Risk Comment": "risk_comment",
    "Plausibility Check": "plausibility_check",
    "Acquisition Score (0-100)": "acquisition_score"
};

/**
 * Cleans numbers, including removing "k EUR" suffixes
 */
function cleanNumber(value) {
    if (typeof value === 'string') {
        // Remove "k EUR", " EUR", and commas
        let cleanVal = value.replace(/k EUR/gi, '').replace(/ EUR/gi, '').replace(/,/g, '').trim();
        if (cleanVal === '') return null;
        const num = parseFloat(cleanVal);
        return isNaN(num) ? null : num;
    }
    return value;
}

async function seedData() {
    // const client = await pool.connect(); // Optional if using API, but keeping for reference
    try {
        console.log('Reading Excel file...');
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

        // --- DYNAMIC HEADER FINDER ---
        let headerRowIndex = -1;
        for (let i = 0; i < 30; i++) {
            // In the Free Version, the header row starts with "Field"
            if (rawData[i] && rawData[i][0] && rawData[i][0].toString().trim() === 'Field') {
                headerRowIndex = i;
                console.log(`Found header "Field" at row index ${i}`);
                break;
            }
        }

        if (headerRowIndex === -1) {
            console.error("❌ Could not find the 'Field' header row.");
            return;
        }

        const headerRow = rawData[headerRowIndex];

        // --- COMPANY COLUMN MAPPING ---
        const companyIndices = {};
        for (let i = 1; i < headerRow.length; i++) {
            const header = headerRow[i];
            if (header && typeof header === 'string' && !IGNORED_HEADERS.includes(header)) {
                companyIndices[header.trim()] = i;
            }
        }

        const companyCount = Object.keys(companyIndices).length;
        console.log(`Found ${companyCount} companies.`);

        // Build Data Object
        const companiesData = {};
        Object.keys(companyIndices).forEach(comp => companiesData[comp] = {});

        // Iterate through rows starting after the header
        for (let i = headerRowIndex + 1; i < rawData.length; i++) {
            const row = rawData[i];
            if (!row || row.length === 0) continue;

            const metricLabel = row[0] ? row[0].toString().trim() : null;

            if (metricLabel && METRIC_MAP[metricLabel]) {
                const sqlColumn = METRIC_MAP[metricLabel];
                for (const [companyName, colIndex] of Object.entries(companyIndices)) {
                    let val = row[colIndex];
                    companiesData[companyName][sqlColumn] = val;
                }
            }
        }

        console.log('Starting DB Insertion via API...');

        for (const [companyName, data] of Object.entries(companiesData)) {
            const payload = {
                company_name: companyName,
                ...data
            };

            // Clean Data
            const stringFields = [
                'sector', 'country', 'currency', 'company_name', 
                'risk_comment', 'plausibility_check'
            ];

            Object.keys(payload).forEach(k => {
                // If it's NOT a string field, try to parse it as a number
                if (!stringFields.includes(k)) {
                    payload[k] = cleanNumber(payload[k]);
                }
            });

            // Send POST request
            try {
                // IMPORTANT: Ensure your API endpoint can handle the "quick valuation" payload
                // You might need a separate endpoint like /api/valuations/quick 
                // or handle the logic based on the payload fields in the main endpoint.
                const response = await fetch('http://localhost:3000/api/free-valuations/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    process.stdout.write('.');
                } else {
                    const errText = await response.text();
                    console.error(`\nFailed for ${companyName}: ${response.status} - ${errText}`);
                }
            } catch (fetchErr) {
                console.error(`\nError sending to API for ${companyName}:`, fetchErr.message);
            }
        }

        console.log('\n✅ Free Version seed process completed!');

    } catch (err) {
        console.error('\n❌ Seed failed:', err);
    }
    await pool.end();
}

seedData();