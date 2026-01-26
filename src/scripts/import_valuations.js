const xlsx = require('xlsx');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

async function importValuations(filePath) {
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
    }

    console.log(`Reading file: ${filePath}`);
    const workbook = xlsx.readFile(filePath);

    // Assuming the data is in the first sheet or we look for a specific one?
    // User prompt mentioned "FREE VERSION - QUICK VALUATION (3-MINUTE ANALYSIS)" or "User Inputs"
    // Let's try to find a sheet that looks like it has the data.
    // Or just iterate through sheets until we find the "Metric" keyword.

    let targetSheet = null;
    let targetSheetName = '';

    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        // Convert to JSON array of arrays to search easier
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

        // Search for "Metric" or "Sector" in the first column
        const hasMetric = data.some(row => row[0] && row[0].toString().trim() === 'Metric');
        if (hasMetric) {
            targetSheet = data;
            targetSheetName = sheetName;
            break;
        }
    }

    if (!targetSheet) {
        console.error('Could not find a sheet with "Metric" column.');
        // Fallback: Try just the first sheet
        targetSheet = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
        targetSheetName = workbook.SheetNames[0];
        console.log(`Fallback: Using first sheet '${targetSheetName}'`);
    } else {
        console.log(`Found data in sheet: '${targetSheetName}'`);
    }

    // Identify the structure
    // We expect a row starting with "Metric" which contains company names in subsequent columns
    let headerRowIndex = -1;
    for (let i = 0; i < targetSheet.length; i++) {
        if (targetSheet[i][0] && targetSheet[i][0].toString().trim() === 'Metric') {
            headerRowIndex = i;
            break;
        }
    }

    if (headerRowIndex === -1) {
        console.error('Could not locate header row starting with "Metric".');
        process.exit(1);
    }

    const headerRow = targetSheet[headerRowIndex];
    const companies = [];

    // Columns 1, 2, 3... are companies
    for (let col = 1; col < headerRow.length; col++) {
        const companyName = headerRow[col];
        if (companyName) {
            companies.push({
                name: companyName,
                colIndex: col
            });
        }
    }

    console.log(`Found companies: ${companies.map(c => c.name).join(', ')}`);

    // Map rows to keys
    const rowMapping = {
        'Sector': 'sector',
        'Country': 'country_code',
        'Currency': 'currency_code',
        'Employees': 'employees',
        'Revenue Y1': 'revenue_y1',
        'Revenue Y2': 'revenue_y2',
        'Revenue Y3': 'revenue_y3',
        'EBIT Y1': 'ebit_y1',
        'EBIT Y2': 'ebit_y2',
        'EBIT Y3': 'ebit_y3',
        'Revenue F1': 'revenue_f1',
        'Revenue F2': 'revenue_f2',
        'Revenue F3': 'revenue_f3',
        'EBIT F1': 'ebit_f1',
        'EBIT F2': 'ebit_f2',
        'EBIT F3': 'ebit_f3',
        'Top-3 %': 'top3_concentration_pct',
        'Founder dependency high?': 'founder_dependency_high',
        'Supplier dependency high?': 'supplier_dependency_high',
        'Key staff retention plan?': 'key_staff_retention_plan',
        'Documentation readiness': 'documentation_readiness',
        'Seller flexibility (earn-out/vendor finance)': 'seller_flexibility',
        'Target timeline': 'target_timeline_months'
    };

    // Extract data for each company
    for (const company of companies) {
        const payload = {
            company_name: company.name
        };

        // Iterate rows starting via the header row
        for (let i = headerRowIndex + 1; i < targetSheet.length; i++) {
            const row = targetSheet[i];
            const label = row[0] ? row[0].toString().trim() : ''; // clean label

            // Clean label from potential extra chars or variations
            // We'll use "includes" or exact match based on the key


            // Find matching key
            let matchedKey = null;
            for (const [key, val] of Object.entries(rowMapping)) {
                // Use strict match to avoid "Country" matching "Country Risk" etc.
                if (label.toLowerCase() === key.toLowerCase()) {
                    matchedKey = val;
                    break;
                }
            }

            if (matchedKey) {
                let value = row[company.colIndex];

                // DATA CLEANING
                if (value !== undefined) {
                    const strVal = value.toString().trim();

                    // Boolean conversion
                    if (['founder_dependency_high', 'supplier_dependency_high', 'key_staff_retention_plan'].includes(matchedKey)) {
                        payload[matchedKey] = strVal.toLowerCase() === 'yes';
                    }
                    // Numeric conversion (remove commas, handle big ints as strings)
                    else if (['employees', 'target_timeline_months',
                        'revenue_y1', 'revenue_y2', 'revenue_y3',
                        'ebit_y1', 'ebit_y2', 'ebit_y3',
                        'revenue_f1', 'revenue_f2', 'revenue_f3',
                        'ebit_f1', 'ebit_f2', 'ebit_f3'].includes(matchedKey)) {
                        // Remove commas
                        const cleanNum = strVal.replace(/,/g, '');
                        if (cleanNum && !isNaN(cleanNum)) {
                            // If it's a financial metric, keep as string to avoid JS precision issues with BigInts before sending?
                            // Axios sends JSON. JSON numbers are doubles. BigInts typically sent as strings.
                            // The API expects strings or numbers. 
                            // Let's send as string to be safe.
                            payload[matchedKey] = cleanNum;
                        }
                    }
                    // Percentage
                    else if (matchedKey === 'top3_concentration_pct') {
                        const cleanNum = strVal.replace(/%/g, '');
                        payload[matchedKey] = parseFloat(cleanNum);
                    }
                    // Strings
                    else {
                        payload[matchedKey] = strVal;
                    }
                }
            }
        }

        console.log(`Processing ${company.name}...`);
        // console.log(payload);

        try {
            const response = await axios.post('http://localhost:3000/api/valuations', payload);
            console.log(`SUCCESS: Created valuation for ${company.name}`);
            console.log(`  > EV Low:  ${response.data.val_ev_low_eur}`);
            console.log(`  > EV Mid:  ${response.data.val_ev_mid_eur}`);
            console.log(`  > EV High: ${response.data.val_ev_high_eur}`);
        } catch (error) {
            console.error(`FAILED: Could not create valuation for ${company.name}`);
            if (error.response) {
                console.error(`  > Status: ${error.response.status}`);
                console.error(`  > Data:`, error.response.data);
            } else {
                console.error(`  > Error: ${error.message}`);
            }
        }
        console.log('---');
    }
}

const filePath = process.argv[2];
if (!filePath) {
    console.log("Usage: node src/scripts/import_valuations.js <path_to_excel_file>");
    process.exit(1);
}

importValuations(filePath);
