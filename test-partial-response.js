// Test: Single POST with ALL entries + correct partialResponse format
// Hypothesis: If we include all entries + a partialResponse with all data + full pageHistory, it should work
const https = require('https');
const fs = require('fs');

const FORM_ID = '1FAIpQLSffPaS5ijUqYEcGf3biznBL2Udwqe6aio9jRG16JTD3WMYLHQ';
const HOST = 'docs.google.com';
const PATH = `/forms/d/e/${FORM_ID}/formResponse`;

// Use a real fbzx value from Puppeteer capture
const FBZX = '-3202435229734609931';

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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                const hasConfirm = body.includes('freebirdFormviewerViewResponseConfirmationMessage');
                results.push({
                    test: description,
                    status: res.statusCode,
                    bodyLen: body.length,
                    confirmed: hasConfirm
                });
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
    // Build the partialResponse that wraps ALL entries from pages 0 and 1
    // Format from Puppeteer: [[null,entryId,["value"],0],[null,entryId,["value"],0]...],null,"fbzx"]
    const partialResponseAllPages = JSON.stringify([
        [
            [null, 1152921546, ["SinglePostTest_A"], 0],
            [null, 1515637797, ["Opsi 1"], 0],
            [null, 577699138, ["Opsi 1"], 0],
            [null, 476679252, ["Opsi 1"], 0]
        ],
        null,
        FBZX
    ]);

    const entries = [
        'entry.948531731=SinglePostTest_B',     // Page 2 short answer
        'entry.718073519=Opsi+1',             // Page 2 MC
        'entry.1323593743=Opsi+1',            // Page 2 MC
    ].join('&');

    // Test 1: Final page entries + partialResponse with all prev data + full pageHistory (mimics real final submit)
    const t1 = `${entries}&fvv=1&partialResponse=${encodeURIComponent(partialResponseAllPages)}&pageHistory=${encodeURIComponent('0,1,2')}&fbzx=${FBZX}&submissionTimestamp=${Date.now()}`;
    await makeRequest("T1_FINAL_PAGE_WITH_PARTIAL", t1);

    // Test 2: ALL entries at once + partialResponse + full pageHistory (no continue)
    const allEntries = [
        'entry.1152921546=SinglePostTest_C',
        'entry.1515637797=Opsi+1',
        'entry.577699138=Opsi+1',
        'entry.476679252=Opsi+1',
        'entry.948531731=SinglePostTest_D',
        'entry.718073519=Opsi+1',
        'entry.1323593743=Opsi+1',
    ].join('&');

    const partialEmpty = JSON.stringify([null, null, FBZX]);
    const t2 = `${allEntries}&fvv=1&partialResponse=${encodeURIComponent(partialEmpty)}&pageHistory=${encodeURIComponent('0,1,2')}&fbzx=${FBZX}&submissionTimestamp=${Date.now()}`;
    await makeRequest("T2_ALL_ENTRIES_PARTIAL_EMPTY", t2);

    // Test 3: ALL entries + no partialResponse + full pageHistory + submissionTimestamp (simplest approach)
    const t3 = `${allEntries}&fvv=1&pageHistory=${encodeURIComponent('0,1,2')}&fbzx=${FBZX}&submissionTimestamp=${Date.now()}`;
    await makeRequest("T3_ALL_ENTRIES_NO_PARTIAL", t3);

    // Test 4: Mimic exact final request from browser for ONLY last page + full partialResponse
    // This is the exact format from the Puppeteer capture  
    const t4 = `${entries}&fvv=1&partialResponse=${encodeURIComponent(partialResponseAllPages)}&pageHistory=${encodeURIComponent('0,1,2')}&fbzx=${FBZX}&submissionTimestamp=${Date.now()}`;
    await makeRequest("T4_EXACT_BROWSER_FINAL", t4);

    // Write results
    fs.writeFileSync('test-partial-results.json', JSON.stringify(results, null, 2), 'utf8');

    // Print summary
    results.forEach(r => {
        process.stdout.write(`${r.test}: ${r.status} confirmed=${r.confirmed}\n`);
    });
})();
