const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// CONFIGURATION
const FILE_PATH = "C:/Users/hassa/Downloads/2. Standard Version dataset_Jay's inputs_60 dataset.xlsx";
const SHEET_NAME = "Reference Data sheet";

/**
 * Helper function to find and extract a specific table from the raw sheet data.
 */
function extractTable(rawData, headerKeyword, columnMapping) {
    // 1. Find the start row STRICTLY
    let startRowIndex = -1;
    
    for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || !Array.isArray(row)) continue;

        // FIX 1: Strict Search. Check if any CELL in this row equals the keyword.
        // We use 'some' to check specific cells rather than stringifying the whole row.
        const foundHeader = row.some(cell => 
            cell && cell.toString().trim().toLowerCase() === headerKeyword.toLowerCase()
        );

        if (foundHeader) {
            startRowIndex = i;
            break;
        }
    }

    if (startRowIndex === -1) {
        console.warn(`Warning: Could not find table header '${headerKeyword}'`);
        return [];
    }

    // 2. Identify Column Indices
    const headerRow = rawData[startRowIndex];
    const mapIndices = {};
    let primaryColIndex = -1; // To track the main column for the 'break' check

    headerRow.forEach((cellValue, index) => {
        if (cellValue && columnMapping[cellValue]) {
            mapIndices[columnMapping[cellValue]] = index;
            // Capture the first mapped column index to use as a "row exists" check later
            if (primaryColIndex === -1) primaryColIndex = index; 
        }
    });

    if (Object.keys(mapIndices).length === 0) {
        console.warn(`Found header row for '${headerKeyword}' but mapped no columns.`);
        return [];
    }

    // 3. Extract Rows
    const extractedRows = [];
    for (let i = startRowIndex + 1; i < rawData.length; i++) {
        const row = rawData[i];

        // FIX 2: Better Break Condition. 
        // Instead of checking row[0] (which might be empty if table is indented),
        // check the 'Primary Column' we identified above.
        const primaryVal = row ? row[primaryColIndex] : null;
        if (!row || primaryVal === undefined || primaryVal === '' || primaryVal === null) {
            break;
        }

        const newRowObj = {};
        let isValidRow = true;

        for (const [sqlCol, excelIndex] of Object.entries(mapIndices)) {
            let val = row[excelIndex];

            // FIX 3: Strict Numeric Cleaning & Garbage Filtering
            if (typeof val === 'string') {
                val = val.trim();
                
                // If we hit the "..." or "…" placeholders commonly found in templates
                if (val.includes('…') || val.includes('...')) {
                    isValidRow = false; 
                    break; 
                }

                // Remove commas for currency
                if (val.includes(',')) {
                    const cleanStr = val.replace(/,/g, '');
                    // Only convert if it is actually a number
                    if (!isNaN(cleanStr) && cleanStr !== '') {
                        val = parseFloat(cleanStr);
                    }
                }
            }
            newRowObj[sqlCol] = val;
        }

        if (isValidRow && Object.keys(newRowObj).length > 0) {
            extractedRows.push(newRowObj);
        }
    }

    return extractedRows;
}

async function insertData(client, tableName, data) {
    if (!data || data.length === 0) {
        console.warn(`No data to insert for ${tableName}`);
        return;
    }

    console.log(`Inserting ${data.length} rows into ${tableName}...`);

    const keys = Object.keys(data[0]);
    if (keys.length === 0) return;

    const cols = keys.join(", ");

    for (const row of data) {
        const values = keys.map(k => row[k]);
        const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
        
        // Using ON CONFLICT DO UPDATE/NOTHING based on your needs. 
        // NOTHING is safer for seed files to avoid duplicates.
        const query = `INSERT INTO ${tableName} (${cols}) VALUES (${placeholders}) 
                       ON CONFLICT DO NOTHING`;

        try {
            await client.query(query, values);
        } catch (err) {
            console.error(`Error in ${tableName}:`, err.message);
            // console.error("Failed Row Data:", values);
        }
    }
    console.log(`Finished ${tableName}.`);
}

async function runSeed() {
    console.log(`Checking file at: ${FILE_PATH}`);
    if (!fs.existsSync(FILE_PATH)) {
        console.error(`Error: File not found.`);
        process.exit(1);
    }

    console.log(`Loading Excel file...`);
    const workbook = XLSX.readFile(FILE_PATH);
    const sheet = workbook.Sheets[SHEET_NAME];

    if (!sheet) {
        console.error(`Sheet '${SHEET_NAME}' not found!`);
        return;
    }

    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    // --- 1. EXTRACT DATA ---
    console.log("Extracting tables...");

    const sectors = extractTable(rawData, "sector_id", {
        "sector_id": "sector_id",
        "subsector_id": "subsector_id",
        "sector_en": "sector_en",
        "sector_de": "sector_de",
        "subsector_en": "subsector_en",
        "subsector_de": "subsector_de",
        "Subsector_Name (Updated)": "subsector_name_updated",
        "Base_EBIT_Multiple": "base_ebit_multiple",
        "Target_EBIT_Margin_%": "target_ebit_margin_pct",
        "Target_CAGR_%": "target_cagr_pct",
        "BandMin": "band_min"
    });

    const countries = extractTable(rawData, "CountryCode", {
        "CountryCode": "country_code",
        "DeltaMultiple": "delta_multiple"
    });

    const sizes = extractTable(rawData, "RevMin_EUR", {
        "RevMin_EUR": "rev_min_eur",
        "DeltaMultiple": "delta_multiple"
    });

    const concs = extractTable(rawData, "Top3_MinPct", {
        "Top3_MinPct": "top3_min_pct",
        "DeltaMultiple": "delta_multiple"
    });

    const fxRates = extractTable(rawData, "RateToEUR", {
        "Currency": "currency_code",
        "RateToEUR": "rate_to_eur"
    });

    const dealSizes = extractTable(rawData, "EV_Min_EUR", {
        "EV_Min_EUR": "ev_min_eur",
        "SizeScore": "size_score"
    });

    const ratings = extractTable(rawData, "Rating", {
        "Rating": "rating",
        "Score": "score"
    });

    // --- 2. DATABASE OP ---
    if (!process.env.DATABASE_URL) {
        console.error("Error: DATABASE_URL missing.");
        process.exit(1);
    }

    const client = new Client({ connectionString: process.env.DATABASE_URL });

    try {
        await client.connect();
        console.log("Connected to database.");

        await insertData(client, 'constant_sector_metrics', sectors);
        await insertData(client, 'constant_country_adjustments', countries);
        await insertData(client, 'constant_size_adjustments', sizes);
        await insertData(client, 'constant_concentration_adjustments', concs);
        await insertData(client, 'constant_fx_rates', fxRates);
        await insertData(client, 'constant_deal_size_scores', dealSizes);
        await insertData(client, 'constant_credit_ratings', ratings);

        console.log("\nAll data seeded successfully.");
    } catch (err) {
        console.error("Database error:", err);
    } finally {
        await client.end();
    }
}

runSeed().catch(e => console.error(e));