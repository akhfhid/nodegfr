const https = require('https');
const fs = require('fs');

const FORM_ID = '1FAIpQLSffPaS5ijUqYEcGf3biznBL2Udwqe6aio9jRG16JTD3WMYLHQ';
// const URL_ID = 'e/1FAIpQLSffPaS5ijUqYEcGf3biznBL2Udwqe6aio9jRG16JTD3WMYLHQ';
const HOST = 'docs.google.com';
const PATH = `/forms/d/e/${FORM_ID}/formResponse`;

// Page IDs: 0, 63316520, 582135968
// Hidden Inputs: fbzx=1837909981325377179

const makeRequest = (ph) => {
    return new Promise((resolve) => {
        // Page 0: 1152921546, 1515637797
        // Page 1: 577699138, 476679252
        // Page 2: 948531731, 718073519, 1323593743
        // FBZX: -3343186019079660896 (Dynamic, but using hardcoded for now if valid, else need to fetch)

        // Use the fbzx from the latest debug run
        const fbzx = "-3343186019079660896";

        let formData = `fvv=1&fbzx=${fbzx}&draftResponse=%5Bnull%2Cnull%2C%22${fbzx}%22%5D&continue=1`;

        // Page 0 Data
        formData += '&entry.1152921546=Test+Repro';
        formData += '&entry.1515637797=Opsi+1';

        // Page 1 Data
        formData += '&entry.577699138=Opsi+1';
        formData += '&entry.476679252=Opsi+1';

        // Page 2 Data
        formData += '&entry.948531731=Test+End';
        formData += '&entry.718073519=Opsi+1';
        formData += '&entry.1323593743=Opsi+1';

        if (ph !== null) {
            formData += '&pageHistory=' + encodeURIComponent(ph);
        }

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
                resolve({ statusCode: res.statusCode, body: body });
            });
        });

        req.on('error', (e) => {
            console.error(e);
            resolve({ statusCode: 'ERROR', body: '' });
        });

        req.write(formData);
        req.end();
    });
};

(async () => {
    const phs = [
        "0,63316520,582135968", // Full history including current page
        "0,63316520",           // History up to previous page
        "0"                     // Start only
    ];

    const stream = fs.createWriteStream('repro_result_2.txt');
    const log = (msg) => {
        console.log(msg);
        stream.write(msg + '\n');
    };

    for (const ph of phs) {
        log(`\n--- Testing pageHistory: "${ph}" ---`);
        const result = await makeRequest(ph);
        log(`STATUS: ${result.statusCode}`);
        if (result.statusCode !== 200) {
            // log(`BODY: ${result.body.substring(0, 200)}...`);
        }
    }
})();
