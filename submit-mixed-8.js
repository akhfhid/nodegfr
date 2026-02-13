const https = require('https');

// Target Form ID
const FORM_ID = '1FAIpQLScH53oLOV2yBQrmFfxd8KKGFlnwbifW7RwnDk_s_-yAMAtA5w';

// Cookies (reused from submit-multiple.js)
const COOKIES = [
    'S=spreadsheet_forms=hFs4mhWCLPfHChIEWext8_gua80G8ZpAJLs1W6Ji8p8',
    'COMPASS=spreadsheet_forms=CjIACWuJV7U1TqA8QrOHF6B4aeWPKT-WDbOZ7i_cGiiG5cRqFMcW-C_OIieonXzF5HU5IBDx2LjMBho0AAlriVegDpUVl-6Ny7tBzj1shGuL5NcW8UcTYOagbkMFxkzn9MHfqEGFp6CBpBdm-8YBwQ==',
    'NID=528=acnnkLQu1Hhhj8SUlrqbaZ1Dn6jOGVWkp6f8XYikC_z43XMHkxwyqtHv_IKaHUAt2pMHGK1P-Xg3UtoO1D0IE80J2fwCWu3VBGBf1Ucy73sUYGK03rVB_v7k8MvW_30EupRGCffOt2cbGjqcbQVU2hqkQ4h2ClBqoxi6KKWY4suqZSWHa1zvzl0xm2WcQjgcExl8QuFH1TJXseVngQ'
].join('; ');

// 8 Unique Names (4 Male, 4 Female)
const mixedNames = [
    // 4 Males (Index 0-3)
    { name: 'Rangga+Sasana', gender: 'Laki-laki', age: '20+-+25+Tahun', job: 'Pelajar%2FMahasiswa' },
    { name: 'Bimo+Sakti', gender: 'Laki-laki', age: '26+-+30+Tahun', job: 'Pegawai+Swasta' },
    { name: 'Dimas+Anggara', gender: 'Laki-laki', age: '%3C+20+Tahun', job: 'Wiraswasta' },
    { name: 'Satria+Muda', gender: 'Laki-laki', age: '20+-+25+Tahun', job: 'PNS%2FBUMN' },

    // 4 Females (Index 4-7)
    { name: 'Rara+Sekar', gender: 'Perempuan', age: '20+-+25+Tahun', job: 'Pelajar%2FMahasiswa' },
    { name: 'Tiara+Andini', gender: 'Perempuan', age: '%3C+20+Tahun', job: 'Pelajar%2FMahasiswa' },
    { name: 'Maudy+Ayunda', gender: 'Perempuan', age: '26+-+30+Tahun', job: 'Pegawai+Swasta' },
    { name: 'Pevita+Pearce', gender: 'Perempuan', age: '20+-+25+Tahun', job: 'Wiraswasta' }
];

// Patterns for variety
const patterns = [
    '&entry.1924543217=2+-+3+kali&entry.51251272=4&entry.1156084830=4&entry.1221770551=5&entry.1215890267=5&entry.1967651057=5&entry.1693758054=4&entry.388817517=3&entry.639181009=2&entry.1237030063=4&entry.2031674321=3&entry.1461192918=5&entry.458801671=3&entry.467904103=5&entry.260658022=5&entry.1360632335=4&entry.949159472=5&entry.1861045329=4&entry.398958557=4&entry.124753191=5&entry.385380631=4&entry.756620367=3&entry.474856170=5&entry.1414589341=5&entry.1372103704=4',
    '&entry.1924543217=4+-+5+kali&entry.51251272=2&entry.1156084830=3&entry.1221770551=4&entry.1215890267=3&entry.1967651057=4&entry.1693758054=5&entry.388817517=3&entry.639181009=5&entry.1237030063=5&entry.2031674321=2&entry.1461192918=5&entry.458801671=1&entry.467904103=3&entry.260658022=5&entry.1360632335=4&entry.949159472=5&entry.1861045329=5&entry.398958557=3&entry.124753191=5&entry.385380631=4&entry.756620367=5&entry.474856170=3&entry.1414589341=3&entry.1372103704=5',
    '&entry.1924543217=Ini+kunjungan+pertama+saya&entry.51251272=4&entry.1156084830=3&entry.1221770551=5&entry.1215890267=5&entry.1967651057=5&entry.1693758054=3&entry.388817517=3&entry.639181009=5&entry.1237030063=1&entry.2031674321=5&entry.1461192918=5&entry.458801671=4&entry.467904103=5&entry.260658022=5&entry.1360632335=3&entry.949159472=1&entry.1861045329=3&entry.398958557=3&entry.124753191=3&entry.385380631=4&entry.756620367=3&entry.474856170=3&entry.1414589341=5&entry.1372103704=4',
    '&entry.1924543217=2+-+3+kali&entry.51251272=2&entry.1156084830=4&entry.1221770551=4&entry.1215890267=4&entry.1967651057=3&entry.1693758054=5&entry.388817517=4&entry.639181009=3&entry.1237030063=5&entry.2031674321=3&entry.1461192918=4&entry.458801671=5&entry.467904103=4&entry.260658022=2&entry.1360632335=5&entry.949159472=2&entry.1861045329=5&entry.398958557=5&entry.124753191=5&entry.385380631=4&entry.756620367=3&entry.474856170=3&entry.1414589341=4&entry.1372103704=4'
];

// Create datasets
const dataSets = mixedNames.map((person, index) => {
    const base = `entry.571527599=${person.name}&entry.161990019=${person.gender}&entry.1667027876=${person.age}&entry.905828166=${person.job}`;
    const pattern = patterns[index % patterns.length];
    return base + pattern;
});

async function submitForm(formData, index) {
    return new Promise((resolve, reject) => {
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

        const req = https.request(options, (response) => {
            let body = '';
            response.on('data', (chunk) => body += chunk);
            response.on('end', () => {
                const isSuccess = body.includes('Tanggapan Anda telah dicatat') ||
                    body.includes('Your response has been recorded') ||
                    body.includes('freebirdFormviewerViewResponseConfirmationMessage') ||
                    body.includes('Terima kasih telah meluangkan waktu') ||
                    body.includes('akan dijaga kerahasiaannya'); // Another potential success indicator

                if (isSuccess || response.statusCode === 200) { // Assuming 200 is success based on previous findings unless redirected to error
                    console.log(`[${index + 1}/${dataSets.length}] ✅ Success for ${getNameFromData(formData)} (${mixedNames[index].gender})`);
                    resolve(true);
                } else {
                    console.log(`[${index + 1}/${dataSets.length}] ❌ Failed for ${getNameFromData(formData)}`);
                    console.log(`Status: ${response.statusCode}`);
                    resolve(false);
                }
            });
        });

        req.on('error', (e) => {
            console.error(`[${index + 1}/${dataSets.length}] Error:`, e.message);
            resolve(false);
        });

        req.write(formData);
        req.end();
    });
}

function getNameFromData(formData) {
    const match = formData.match(/entry\.571527599=([^&]+)/);
    return match ? decodeURIComponent(match[1].replace(/\+/g, ' ')) : 'Unknown';
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runAll() {
    console.log(`Starting submission of 8 mixed responses (4 Male, 4 Female)...\n`);

    for (let i = 0; i < dataSets.length; i++) {
        await submitForm(dataSets[i], i);
        const delay = Math.floor(Math.random() * 2000) + 1500;
        await sleep(delay);
    }

    console.log('\nAll 8 submissions completed!');
}

runAll();
