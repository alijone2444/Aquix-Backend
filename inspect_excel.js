const xlsx = require('xlsx');
const path = require('path');

const filePath = 'f:/JOBS/Aquix/3. Enterprise Version dataset_Jay\'2 inputs.xlsx';

try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    // Assume header is at index 6 (Row 7)
    const headerRowIndex = 6;
    const metrics = [];

    for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i];
        if (row && row[0]) {
            metrics.push(row[0]);
        }
    }

    console.log('--- ALL METRICS (Row Headers) ---');
    console.log(JSON.stringify(metrics, null, 2));

} catch (error) {
    console.error('Error reading file:', error);
}
