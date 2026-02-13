const https = require('https');

// Target Form ID
const FORM_ID = '1FAIpQLScH53oLOV2yBQrmFfxd8KKGFlnwbifW7RwnDk_s_-yAMAtA5w';

// Cookies (reused)
const COOKIES = [
    'S=spreadsheet_forms=hFs4mhWCLPfHChIEWext8_gua80G8ZpAJLs1W6Ji8p8',
    'COMPASS=spreadsheet_forms=CjIACWuJV7U1TqA8QrOHF6B4aeWPKT-WDbOZ7i_cGiiG5cRqFMcW-C_OIieonXzF5HU5IBDx2LjMBho0AAlriVegDpUVl-6Ny7tBzj1shGuL5NcW8UcTYOagbkMFxkzn9MHfqEGFp6CBpBdm-8YBwQ==',
    'NID=528=acnnkLQu1Hhhj8SUlrqbaZ1Dn6jOGVWkp6f8XYikC_z43XMHkxwyqtHv_IKaHUAt2pMHGK1P-Xg3UtoO1D0IE80J2fwCWu3VBGBf1Ucy73sUYGK03rVB_v7k8MvW_30EupRGCffOt2cbGjqcbQVU2hqkQ4h2ClBqoxi6KKWY4suqZSWHa1zvzl0xm2WcQjgcExl8QuFH1TJXseVngQ'
].join('; ');

// Female Names (25 unique)
const femaleNames = [
    'Siti+Aminah', 'Nurul+Hidayah', 'Dewi+Sartika', 'Ratna+Sari', 'Sri+Wahyuni',
    'Rina+Marlina', 'Ani+Suryani', 'Eka+Pratiwi', 'Dwi+Astuti', 'Tri+Handayani',
    'Yulianti', 'Rini+Anggraini', 'Desi+Ratnasari', 'Fitriani', 'Indah+Permatasari',
    'Nining+Ningsih', 'Susanti', 'Yanti+Yulianti', 'Wulandari', 'Putri+Ayu',
    'Ayu+Lestari', 'Siska+Amelia', 'Mega+Puspita', 'Dian+Pertiwi', 'Maya+Safira'
];

// Base response patterns (to provide variety in answers)
const patterns = [
    // Pattern 1: Student, < 20, frequent visits
    '&entry.1667027876=%3C+20+Tahun&entry.905828166=Pelajar%2FMahasiswa&entry.1924543217=2+-+3+kali&entry.51251272=4&entry.1156084830=4&entry.1221770551=5&entry.1215890267=5&entry.1967651057=5&entry.1693758054=4&entry.388817517=3&entry.639181009=2&entry.1237030063=4&entry.2031674321=3&entry.1461192918=5&entry.458801671=3&entry.467904103=5&entry.260658022=5&entry.1360632335=4&entry.949159472=5&entry.1861045329=4&entry.398958557=4&entry.124753191=5&entry.385380631=4&entry.756620367=3&entry.474856170=5&entry.1414589341=5&entry.1372103704=4',
    // Pattern 2: PNS, > 30, loyal
    '&entry.1667027876=%3E+30+Tahun&entry.905828166=PNS%2FBUMN&entry.1924543217=4+-+5+kali&entry.51251272=2&entry.1156084830=3&entry.1221770551=4&entry.1215890267=3&entry.1967651057=4&entry.1693758054=5&entry.388817517=3&entry.639181009=5&entry.1237030063=5&entry.2031674321=2&entry.1461192918=5&entry.458801671=1&entry.467904103=3&entry.260658022=5&entry.1360632335=4&entry.949159472=5&entry.1861045329=5&entry.398958557=3&entry.124753191=5&entry.385380631=4&entry.756620367=5&entry.474856170=3&entry.1414589341=3&entry.1372103704=5',
    // Pattern 3: Private Employee, 20-25, critical
    '&entry.1667027876=20+-+25+Tahun&entry.905828166=Pegawai+Swasta&entry.1924543217=Ini+kunjungan+pertama+saya&entry.51251272=4&entry.1156084830=3&entry.1221770551=5&entry.1215890267=5&entry.1967651057=5&entry.1693758054=3&entry.388817517=3&entry.639181009=5&entry.1237030063=1&entry.2031674321=5&entry.1461192918=5&entry.458801671=4&entry.467904103=5&entry.260658022=5&entry.1360632335=3&entry.949159472=1&entry.1861045329=3&entry.398958557=3&entry.124753191=3&entry.385380631=4&entry.756620367=3&entry.474856170=3&entry.1414589341=5&entry.1372103704=4',
    // Pattern 4: Entrepreneur, 26-30, mixed
    '&entry.1667027876=26+-+30+Tahun&entry.905828166=Wiraswasta&entry.1924543217=2+-+3+kali&entry.51251272=2&entry.1156084830=4&entry.1221770551=4&entry.1215890267=4&entry.1967651057=3&entry.1693758054=5&entry.388817517=4&entry.639181009=3&entry.1237030063=5&entry.2031674321=3&entry.1461192918=4&entry.458801671=5&entry.467904103=4&entry.260658022=2&entry.1360632335=5&entry.949159472=2&entry.1861045329=5&entry.398958557=5&entry.124753191=5&entry.385380631=4&entry.756620367=3&entry.474856170=3&entry.1414589341=4&entry.1372103704=4',
    // Pattern 5: Student, < 20
    '&entry.1667027876=%3C+20+Tahun&entry.905828166=Pelajar%2FMahasiswa&entry.1924543217=4+-+5+kali&entry.51251272=2&entry.1156084830=3&entry.1221770551=5&entry.1215890267=5&entry.1967651057=5&entry.1693758054=4&entry.388817517=4&entry.639181009=5&entry.1237030063=5&entry.2031674321=5&entry.1461192918=4&entry.458801671=3&entry.467904103=5&entry.260658022=4&entry.1360632335=5&entry.949159472=4&entry.1861045329=4&entry.398958557=3&entry.124753191=5&entry.385380631=4&entry.756620367=5&entry.474856170=4&entry.1414589341=3&entry.1372103704=4'
];

// Combine to create datasets
const dataSets = femaleNames.map((name, index) => {
    // entry.161990019=Perempuan (Gender is hardcoded to Female)
    const base = `entry.571527599=${name}&entry.161990019=Perempuan`;
    const pattern = patterns[index % patterns.length]; // Cycle through patterns
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
                // Expanded success checks including the specific text found in debug
                const isSuccess = body.includes('nakan hanya digunakan untuk kepentingan akademis') ||
                    body.includes('Tanggapan Anda telah dicatat') ||
                    body.includes('Your response has been recorded') ||
                    body.includes('freebirdFormviewerViewResponseConfirmationMessage') ||
                    body.includes('Terima kasih telah meluangkan waktu');

                if (isSuccess) {
                    console.log(`[${index + 1}/${dataSets.length}] ✅ Success for ${getNameFromData(formData)} (Female)`);
                    resolve(true);
                } else {
                    console.log(`[${index + 1}/${dataSets.length}] ❌ Failed for ${getNameFromData(formData)}`);
                    console.log(`Status: ${response.statusCode}`);
                    // Save failed body for inspection if needed, but not every time
                    // const fs = require('fs');
                    // fs.writeFileSync(`failed-${index}.html`, body);
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
    console.log(`Starting ${dataSets.length} female respondent submissions...\n`);

    for (let i = 0; i < dataSets.length; i++) {
        await submitForm(dataSets[i], i);
        const delay = Math.floor(Math.random() * 2000) + 1200; // Slightly longer delay
        await sleep(delay);
    }

    console.log('\nAll female submissions completed!');
}

runAll();
