const http = require('http');

function makeRequest(path) {
    return new Promise((resolve, reject) => {
        http.get({
            hostname: 'localhost',
            port: 3000,
            path: path,
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    data: JSON.parse(data)
                });
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

function makePostRequest(path, body) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(body);
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    data: JSON.parse(data)
                });
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        req.write(postData);
        req.end();
    });
}

async function verifyRoutes() {
    try {
        console.log('Verifying API Routes...');

        // 1. Get All Constants
        console.log('1. GET /api/companies/constants');
        const constants = await makeRequest('/api/companies/constants');
        console.log(`   Status: ${constants.statusCode}, Records: ${constants.data.length}`);

        // 2. Get All Financials
        console.log('2. GET /api/companies/financials');
        const financials = await makeRequest('/api/companies/financials');
        console.log(`   Status: ${financials.statusCode}, Records: ${financials.data.length}`);

        // 3. Get Specific Company Constants
        console.log('3. GET /api/companies/Company%20A/constants');
        const compAConst = await makeRequest('/api/companies/Company%20A/constants');
        console.log(`   Status: ${compAConst.statusCode}, Company: ${compAConst.data.company_name}`);

        // 4. Get Specific Company Financials
        console.log('4. GET /api/companies/Company%20A/financials');
        const compAFin = await makeRequest('/api/companies/Company%20A/financials');
        console.log(`   Status: ${compAFin.statusCode}, Company: ${compAFin.data.company_name}`);
        console.log(`   Revenue Y1: ${compAFin.data.revenue_y1}`);

        // 5. POST /api/query (Raw SQL)
        console.log('5. POST /api/query (Raw SQL Test)');
        const rawQuery = await makePostRequest('/api/query', {
            query: "SELECT count(*) as count FROM company_financial_data"
        });
        console.log(`   Status: ${rawQuery.statusCode}, Count: ${rawQuery.data[0].count}`);

        console.log('\n✅ Route verification completed.');
    } catch (error) {
        console.error('Verification failed:', error);
    }
}

verifyRoutes();
