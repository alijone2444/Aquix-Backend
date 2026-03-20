const xlsx = require('xlsx');
const path = require('path');
const { Pool } = require('pg');

// Configure your database connection
const connectionString = 'postgresql://neondb_owner:npg_dv5xH2VfFAgJ@ep-floral-surf-a4a6j6xp-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

// UPDATED: File path for the Standard Version
const filePath = "/Users/afnanhassan/Downloads/2.\ Standard\ Version\ dataset_Jay\'s\ inputs_60\ dataset_V3.xlsx";

// ---------------------------------------------------------
// 1. HEADERS TO IGNORE
// ---------------------------------------------------------
const IGNORED_HEADERS = [
    'Primary Source',
    'Secondary / Validation Source',
    'Data Nature',
    'Notes',
    'Model Reference Date',
    'User Inputs',
    'Blue Cells',
    'Calculated Fields',
    'Green Cells',
    'Yellow Cells'
];

// ---------------------------------------------------------
// 2. METRIC MAP (Adapted for Standard Version)
// ---------------------------------------------------------
const METRIC_MAP = {
    // 1. IDENTIFICATION
    "Sector": "sector",
    "Country": "country_code",
    "Currency": "currency_code",
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

    // 4. RISK & OPERATIONS INPUTS (Standard Version Specific)
    "Top-3 %": "top3_concentration_pct",
    "Founder dependency high?": "founder_dependency_high",
    "Supplier dependency high?": "supplier_dependency_high",
    "Key staff retention plan?": "key_staff_retention_plan",
    "Documentation readiness": "documentation_readiness", // e.g., "Full", "Partial"
    "Seller flexibility (earn-out/vendor finance)": "seller_flexibility", // e.g., "High", "Medium"
    "Target timeline": "target_timeline_months"
};

/**
 * Parses Excel date serial numbers to 'YYYY-MM-DD'
 */
function parseExcelDate(value) {
    if (!value) return null;
    if (typeof value === 'number') {
        const excelBaseDate = new Date(1899, 11, 30);
        const date = new Date(excelBaseDate.getTime() + value * 24 * 60 * 60 * 1000);
        return date.toISOString().split('T')[0];
    }
    if (typeof value === 'string') {
        if (value.length > 20 || isNaN(Date.parse(value))) return null;
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
        // Assuming data is on the first sheet
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

        // --- DYNAMIC HEADER FINDER ---
        let headerRowIndex = -1;
        for (let i = 0; i < 30; i++) { // Increased search range slightly
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

        // --- COMPANY COLUMN MAPPING ---
        const companyIndices = {};
        for (let i = 1; i < headerRow.length; i++) {
            const header = headerRow[i];
            if (header && typeof header === 'string' && !IGNORED_HEADERS.includes(header)) {
                // Trim potential whitespace
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
            // Safety check for empty rows
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
            // Construct Payload
            const payload = {
                company_name: companyName,
                ...data
            };

            // 1. Clean Booleans
            const boolFields = [
                'founder_dependency_high', 
                'supplier_dependency_high', 
                'key_staff_retention_plan'
            ];
            boolFields.forEach(k => {
                if (payload[k] !== undefined) payload[k] = parseBoolean(payload[k]);
            });

            // 2. Clean Numbers (remove commas, parse float)
            // Exclude string fields from number parsing
            const stringFields = [
                'sector', 
                'country_code', 
                'currency_code', 
                'documentation_readiness', 
                'seller_flexibility', 
                'company_name'
            ];

            Object.keys(payload).forEach(k => {
                if (!stringFields.includes(k) && typeof payload[k] === 'string') {
                    // Check if it looks like a number
                    const cleanVal = payload[k].replace(/,/g, '');
                    if (!isNaN(parseFloat(cleanVal))) {
                        payload[k] = parseFloat(cleanVal);
                    }
                }
            });

            // Send POST request
            try {
                // Ensure the API endpoint handles the standard version schema (columns)
                const response = await fetch('http://localhost:3000/api/standard-valuations', {
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

        console.log('\n✅ Standard Version seed process completed!');

    } catch (err) {
        console.error('\n❌ Seed failed:', err);
    }
    await pool.end();
}

seedData();