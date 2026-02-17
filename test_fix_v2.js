const https = require('https');

const FORM_ID = '1FAIpQLSffPaS5ijUqYEcGf3biznBL2Udwqe6aio9jRG16JTD3WMYLHQ';
const HOST = 'docs.google.com';
const PATH = `/forms/d/e/${FORM_ID}/formResponse`;

const FBZX = "-3343186019079660896";

const makeRequest = (description, params) => {
    return new Promise((resolve) => {
        let formData = `fvv=1&fbzx=${FBZX}`;

        // Add optional params
        if (params.includeContinue) formData += '&continue=1';
        if (params.includeDraft) formData += `&draftResponse=%5Bnull%2Cnull%2C%22${FBZX}%22%5D`;
        if (params.pageHistory) formData += `&pageHistory=${params.pageHistory}`;

        // User Provided Values
        formData += '&entry.1152921546=tset0';
        formData += '&entry.1515637797=Opsi+1';

        formData += '&entry.577699138=Opsi+1';
        formData += '&entry.476679252=Opsi+1';

        formData += '&entry.948531731=test67';
        formData += '&entry.718073519=Opsi+1';
        formData += '&entry.1323593743=Opsi+1';

        const options = {
            hostname: HOST,
            path: PATH,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(formData),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) width test user payload'
            }
        };

        console.log(`\n--- TEST: ${description} ---`);

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                console.log(`STATUS: ${res.statusCode}`);
                resolve(res.statusCode);
            });
        });

        req.on('error', (e) => {
            console.error(e);
            resolve('ERROR');
        });

        req.write(formData);
        req.end();
    });
};

(async () => {
    // Only test the configuration that gave 200 before, but with new data
    await makeRequest("User Payload with Continue/Draft", {
        includeContinue: true,
        includeDraft: true,
        pageHistory: "0,63316520,582135968"
    });
})();
