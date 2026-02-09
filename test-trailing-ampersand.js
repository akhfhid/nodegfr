const https = require('https');

// Test URL that user shared - with trailing &
const testUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSffPaS5ijUqYEcGf3biznBL2Udwqe6aio9jRG16JTD3WMYLHQ/formResponse?usp=header&entry.463116679=%40affan&entry.874088795=Perempuan&entry.1952791983=%3E40+tahun&entry.87880322=Wirausaha&entry.354437570=%3ERp5.000.000&entry.260192708=Tidak&entry.2041629640=Lebih+dari+5+kali&entry.248450205=Menonton+tanpa+berinteraksi&entry.248450205=Memberikan+like&entry.248450205=Menulis+komentar&entry.248450205=Membaca+komentar+audiens+lain&entry.248450205=Membagikan+konten+kepada+teman&entry.248450205=Membeli+produk+di+keranjang+kuning&entry.248450205=Join+live+streaming&entry.1058435764=Lebih+dari+1+bulan+yang+lalu&entry.1538658065=7&entry.1514169783=7&entry.1777095326=7&entry.585282725=7&entry.409157007=7&entry.1030408836=7&entry.1751101224=7&entry.1982553390=7&entry.240334797=7&entry.1740276234=7&entry.1705207986=7&entry.254544143=7&entry.1756653078=7&entry.1489487023=7&entry.879144322=7&entry.870868951=7&entry.1940033216=7&entry.413393584=7&entry.1887440289=7&entry.1247709025=7&entry.2003272885=7&entry.4837277=7&entry.665814063=7&entry.173593087=7&entry.2020795724=7&entry.1910155789=7&entry.1391424544=7&entry.1973030374=7&entry.261307184=7&entry.1041834844=7&entry.1899237172=7&entry.1008624246=7&entry.895411908=7&entry.10870000=7&entry.1677061212=7&entry.1533457839=7&entry.1025414558=7&entry.1362576289=7&entry.1867896381=7&entry.1650738802=7&entry.2026909074=7&entry.159913185=7&';

// Test without trailing &
const cleanUrl = testUrl.replace(/&$/, '');

console.log('=== TESTING SINGLE-PAGE FORM SUBMISSION ===\n');
console.log('URL ends with &:', testUrl.endsWith('&'));
console.log('URL length:', testUrl.length);
console.log('\n--- Test 1: With Trailing & ---');

https.get(testUrl, (res) => {
    console.log('Status:', res.statusCode);
    console.log('Redirect:', res.headers.location || 'None');

    if (res.statusCode >= 200 && res.statusCode < 400) {
        console.log('✅ Likely success!\n');
    } else {
        console.log('❌ Failed\n');
    }

    // Test without trailing &
    console.log('--- Test 2: Without Trailing & ---');
    https.get(cleanUrl, (res2) => {
        console.log('Status:', res2.statusCode);
        console.log('Redirect:', res2.headers.location || 'None');

        if (res2.statusCode >= 200 && res2.statusCode < 400) {
            console.log('✅ Likely success!');
        } else {
            console.log('❌ Failed');
        }

        console.log('\n📊 RESULT:');
        console.log('Trailing & matters?', res.statusCode !== res2.statusCode ? 'YES' : 'NO');
        console.log('\n🔍 Check form responses to verify!');
    }).on('error', (e) => console.error('Error:', e.message));

}).on('error', (e) => console.error('Error:', e.message));
