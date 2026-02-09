const https = require('https');
const fs = require('fs');

const FORM_ID = '1FAIpQLSffPaS5ijUqYEcGf3biznBL2Udwqe6aio9jRG16JTD3WMYLHQ';
const formData = 'entry.463116679=test&entry.874088795=Laki-laki&entry.1952791983=20-30+tahun&entry.87880322=Pegawai+Negeri&entry.354437570=Rp1.000.000-2.000.000&entry.260192708=Ya&entry.2041629640=1+kali&entry.248450205=Menonton+tanpa+berinteraksi&entry.1058435764=Dalam+1+minggu+terakhir&entry.1538658065=7&entry.1514169783=6&entry.1777095326=3&entry.585282725=5&entry.409157007=2';

console.log('=== ANALYZING GOOGLE FORMS RESPONSE ===\n');

const options = {
    hostname: 'docs.google.com',
    path: `/forms/d/e/${FORM_ID}/formResponse`,
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(formData),
        'User-Agent': 'Mozilla/5.0'
    }
};

const req = https.request(options, (response) => {
    console.log('Status Code:', response.statusCode);
    console.log('Headers:', JSON.stringify(response.headers, null, 2));

    let body = '';
    response.on('data', (chunk) => {
        body += chunk;
    });

    response.on('end', () => {
        console.log('\nResponse Body Length:', body.length);

        // Save full response to file for analysis
        fs.writeFileSync('response-body.html', body);
        console.log('✅ Saved response to response-body.html');

        // Check for common error indicators
        const checks = {
            'Has "required"': body.toLowerCase().includes('required'),
            'Has "error"': body.toLowerCase().includes('error'),
            'Has "invalid"': body.toLowerCase().includes('invalid'),
            'Has "submission"': body.toLowerCase().includes('submission'),
            'Has "thank"': body.toLowerCase().includes('thank'),
            'Has "response recorded"': body.toLowerCase().includes('response recorded'),
            'Has "terima kasih"': body.toLowerCase().includes('terima kasih'),
            'Has entry.': body.includes('entry.')
        };

        console.log('\n🔍 Error Indicators:');
        for (const [check, result] of Object.entries(checks)) {
            console.log(`  ${result ? '✓' : '✗'} ${check}`);
        }

        // Extract title
        const titleMatch = body.match(/<title>(.*?)<\/title>/i);
        if (titleMatch) {
            console.log('\n📄 Page Title:', titleMatch[1]);
        }

        console.log('\n💡 Check response-body.html for full details');
    });
});

req.on('error', (e) => {
    console.error('❌ Error:', e.message);
});

req.write(formData);
req.end();
