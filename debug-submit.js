const https = require('https');
const fs = require('fs');

const FORM_ID = '1FAIpQLScH53oLOV2yBQrmFfxd8KKGFlnwbifW7RwnDk_s_-yAMAtA5w';
const COOKIES = [
    'S=spreadsheet_forms=hFs4mhWCLPfHChIEWext8_gua80G8ZpAJLs1W6Ji8p8',
    'COMPASS=spreadsheet_forms=CjIACWuJV7U1TqA8QrOHF6B4aeWPKT-WDbOZ7i_cGiiG5cRqFMcW-C_OIieonXzF5HU5IBDx2LjMBho0AAlriVegDpUVl-6Ny7tBzj1shGuL5NcW8UcTYOagbkMFxkzn9MHfqEGFp6CBpBdm-8YBwQ==',
    'NID=528=acnnkLQu1Hhhj8SUlrqbaZ1Dn6jOGVWkp6f8XYikC_z43XMHkxwyqtHv_IKaHUAt2pMHGK1P-Xg3UtoO1D0IE80J2fwCWu3VBGBf1Ucy73sUYGK03rVB_v7k8MvW_30EupRGCffOt2cbGjqcbQVU2hqkQ4h2ClBqoxi6KKWY4suqZSWHa1zvzl0xm2WcQjgcExl8QuFH1TJXseVngQ'
].join('; ');

const formData = 'entry.571527599=Eko+Prasetyo&entry.161990019=Laki-laki&entry.1667027876=20+-+25+Tahun&entry.905828166=PNS%2FBUMN&entry.1924543217=2+-+3+kali&entry.51251272=2&entry.1156084830=2&entry.1221770551=5&entry.1215890267=5&entry.1967651057=5&entry.1693758054=3&entry.388817517=4&entry.639181009=5&entry.1237030063=5&entry.2031674321=3&entry.1461192918=5&entry.458801671=5&entry.467904103=5&entry.260658022=5&entry.1360632335=5&entry.949159472=5&entry.1861045329=4&entry.398958557=5&entry.124753191=5&entry.385380631=4&entry.756620367=4&entry.474856170=5&entry.1414589341=3&entry.1372103704=3';

const options = {
    hostname: 'docs.google.com',
    path: `/forms/d/e/${FORM_ID}/formResponse`,
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(formData),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': COOKIES
    }
};

console.log('Sending debug request...');

const req = https.request(options, (response) => {
    let body = '';
    response.on('data', (chunk) => body += chunk);
    response.on('end', () => {
        console.log('Status Code:', response.statusCode);
        fs.writeFileSync('debug-response.html', body);
        console.log('Saved response to debug-response.html');

        const isSuccess = body.includes('Tanggapan Anda telah dicatat') ||
            body.includes('Your response has been recorded') ||
            body.includes('freebirdFormviewerViewResponseConfirmationMessage');

        if (isSuccess) {
            console.log('SUCCESS');
        } else {
            console.log('FAILURE');
        }
    });
});

req.on('error', (e) => console.error(e));
req.write(formData);
req.end();
