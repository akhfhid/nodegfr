const https = require('https');
const fs = require('fs');

const FORM_ID = '1FAIpQLSffPaS5ijUqYEcGf3biznBL2Udwqe6aio9jRG16JTD3WMYLHQ';
const HOST = 'docs.google.com';
const PATH = `/forms/d/e/${FORM_ID}/formResponse`;

const results = [];

const makeRequest = (description, formData) => {
    return new Promise((resolve) => {
        const options = {
            hostname: HOST,
            path: PATH,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(formData),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                const hasConfirm = body.includes('freebirdFormviewerViewResponseConfirmationMessage');
                results.push({ test: description, status: res.statusCode, bodyLen: body.length, confirmed: hasConfirm });
                resolve();
            });
        });

        req.on('error', (e) => {
            results.push({ test: description, status: 'ERROR', error: e.message });
            resolve();
        });

        req.write(formData);
        req.end();
    });
};

(async () => {
    const entries = [
        'entry.1152921546=TestMP_A',
        'entry.1515637797=Opsi+1',
        'entry.577699138=Opsi+1',
        'entry.476679252=Opsi+1',
        'entry.948531731=TestMP_B',
        'entry.718073519=Opsi+1',
        'entry.1323593743=Opsi+1',
    ].join('&');

    // Test 1: Raw entries only
    await makeRequest("T1_RAW_ONLY", entries);

    // Test 2: Entries + pageHistory (encoded)
    await makeRequest("T2_ENTRIES_PH_ENC",
        entries + '&pageHistory=0%2C63316520%2C582135968');

    // Test 3: fvv + entries + pageHistory
    await makeRequest("T3_FVV_ENTRIES_PH",
        'fvv=1&' + entries + '&pageHistory=0%2C63316520%2C582135968');

    // Test 4: Full params with dummy fbzx
    const fbzx = '1234567890';
    await makeRequest("T4_FULL_DUMMYFBZX",
        `fvv=1&fbzx=${fbzx}&continue=1&draftResponse=%5Bnull%2Cnull%2C%22${fbzx}%22%5D&${entries}&pageHistory=0%2C63316520%2C582135968`);

    // Test 5: pageHistory unencoded
    await makeRequest("T5_PH_UNENCODED",
        entries + '&pageHistory=0,63316520,582135968');

    // Write JSON results
    fs.writeFileSync('test-mp-results.json', JSON.stringify(results, null, 2), 'utf8');
})();
