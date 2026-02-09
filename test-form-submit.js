const https = require('https');

// Base URL - ganti dengan form ID yang sesuai
const FORM_ID = '1FAIpQLSctkwDOrFYNPzcOQRYmixTpyjDaXnKJW9lY85W5rlX-IJuDxw';
const BASE_URL = `https://docs.google.com/forms/d/e/${FORM_ID}/formResponse`;

// Parameter dari log yang user berikan
const params = 'entry.463116679=%40syahrul&entry.874088795=Perempuan&entry.1952791983=%3E40+tahun&entry.87880322=Wirausaha&entry.354437570=%3ERp5.000.000&entry.260192708=Tidak&entry.2041629640=Lebih+dari+5+kali&entry.248450205=Menonton+tanpa+berinteraksi&entry.248450205=Memberikan+like&entry.248450205=Menulis+komentar&entry.248450205=Membaca+komentar+audiens+lain&entry.248450205=Membagikan+konten+kepada+teman&entry.248450205=Membeli+produk+di+keranjang+kuning&entry.248450205=Join+live+streaming&entry.1058435764=Lebih+dari+1+bulan+yang+lalu&entry.1538658065=7&entry.1514169783=7&entry.1777095326=7&entry.585282725=7&entry.409157007=7&entry.1030408836=7&entry.1751101224=7&entry.1982553390=7&entry.240334797=7&entry.1740276234=7&entry.1705207986=7&entry.254544143=7&entry.1756653078=7&entry.1489487023=7&entry.879144322=7&entry.870868951=7&entry.1940033216=7&entry.413393584=7&entry.1887440289=7&entry.1247709025=7&entry.2003272885=7&entry.4837277=7&entry.665814063=7&entry.173593087=7&entry.2020795724=7&entry.1910155789=7&entry.1391424544=7&entry.1973030374=7&entry.261307184=7&entry.1041834844=7&entry.1899237172=7&entry.1008624246=7&entry.895411908=7&entry.10870000=7&entry.1677061212=7&entry.1533457839=7&entry.1025414558=7&entry.1362576289=7&entry.1867896381=7&entry.1650738802=7&entry.2026909074=7&entry.159913185=7';

const finalUrl = `${BASE_URL}&${params}`;

console.log('=== GOOGLE FORM SUBMISSION TEST ===');
console.log('URL Length:', finalUrl.length);
console.log('Testing URL submission...\n');

// Test 1: GET Request (metode saat ini)
console.log('TEST 1: GET Request (Current Method)');
console.log('URL:', finalUrl.substring(0, 100) + '...');

https.get(finalUrl, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
}, (response) => {
    console.log('Status Code:', response.statusCode);
    console.log('Headers:', JSON.stringify(response.headers, null, 2));

    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', () => {
        console.log('\n--- Response Body (first 500 chars) ---');
        console.log(data.substring(0, 500));
        console.log('\n=== GET Test Complete ===\n');

        // Test 2: POST Request
        testPostRequest();
    });
}).on('error', (e) => {
    console.error('GET Error:', e.message);
    testPostRequest();
});

// Test with POST method
function testPostRequest() {
    console.log('\nTEST 2: POST Request (Alternative Method)');

    const postData = params;

    const options = {
        hostname: 'docs.google.com',
        path: `/forms/d/e/${FORM_ID}/formResponse`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    };

    const req = https.request(options, (response) => {
        console.log('Status Code:', response.statusCode);
        console.log('Headers:', JSON.stringify(response.headers, null, 2));

        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
            console.log('\n--- Response Body (first 500 chars) ---');
            console.log(data.substring(0, 500));
            console.log('\n=== POST Test Complete ===');
            console.log('\n📊 SUMMARY:');
            console.log('- If Status Code = 200-299 → Likely Success');
            console.log('- If Status Code = 302-303 → Redirect (Usually Success)');
            console.log('- If Status Code = 400-499 → Client Error (Form rejected)');
            console.log('- Check your Google Form responses to verify!');
        });
    });

    req.on('error', (e) => {
        console.error('POST Error:', e.message);
    });

    req.write(postData);
    req.end();
}
