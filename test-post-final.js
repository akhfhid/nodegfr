const https = require('https');


// Form data for debugging (Single Entry from batch)
const formData = 'entry.571527599=Kevin+Pratama&entry.161990019=Laki-laki&entry.1667027876=20+-+25+Tahun&entry.905828166=PNS%2FBUMN&entry.1924543217=Ini+kunjungan+pertama+saya&entry.51251272=4&entry.1156084830=3&entry.1221770551=5&entry.1215890267=4&entry.1967651057=4&entry.1693758054=4&entry.388817517=5&entry.639181009=3&entry.1237030063=4&entry.2031674321=4&entry.1461192918=5&entry.458801671=3&entry.467904103=5&entry.260658022=5&entry.1360632335=5&entry.949159472=4&entry.1861045329=4&entry.398958557=4&entry.124753191=3&entry.385380631=3&entry.756620367=4&entry.474856170=2&entry.1414589341=3&entry.1372103704=5';
const FORM_ID = '1FAIpQLSctkwDOrFYNPzcOQRYmixTpyjDaXnKJW9lY85W5rlX-IJuDxw';
].join('; ');

console.log('=== Testing POST Request ===\n');

const options = {
    hostname: 'docs.google.com',
    path: `/forms/d/e/${FORM_ID}/formResponse`,
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(formData),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
};

console.log('Hostname:', options.hostname);
console.log('Path:', options.path);
console.log('Method:', options.method);
console.log('Content-Length:', options.headers['Content-Length']);
console.log('\nSending request...\n');

const req = https.request(options, (response) => {
    console.log('✅ Response received!');
    console.log('Status Code:', response.statusCode);
    console.log('Headers:', JSON.stringify(response.headers, null, 2));

    if (response.headers.location) {
        console.log('\n🔄 Redirect to:', response.headers.location);
    }

    let body = '';
    response.on('data', (chunk) => {
        body += chunk;
    });

    response.on('end', () => {
        console.log('\n📄 Response Body Length:', body.length);
        if (body.length < 500) {
            console.log('Body:', body);
        }

        console.log('\n🔍 NOW CHECK YOUR GOOGLE FORM!');
        console.log(`View responses: https://docs.google.com/forms/d/e/${FORM_ID}/viewanalytics`);
    });
});

req.on('error', (e) => {
    console.error('❌ Error:', e.message);
});

req.write(formData);
req.end();

console.log('Request sent, waiting for response...');
