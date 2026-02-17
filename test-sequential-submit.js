// Test: Sequential submission with integer page IDs  
// Save FULL response body of the LAST page to check what Google returns
const https = require('https');
const fs = require('fs');

const FORM_ID = '1FAIpQLSffPaS5ijUqYEcGf3biznBL2Udwqe6aio9jRG16JTD3WMYLHQ';
const HOST = 'docs.google.com';
const FORM_PATH = `/forms/d/e/${FORM_ID}/formResponse`;

const getFormPage = () => {
    return new Promise((resolve) => {
        https.get(`https://${HOST}/forms/d/e/${FORM_ID}/viewform`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                const fbzxMatch = body.match(/name="fbzx"\s+value="([^"]+)"/);
                resolve(fbzxMatch ? fbzxMatch[1] : null);
            });
        });
    });
};

const makePostRequest = (formData) => {
    return new Promise((resolve) => {
        const options = {
            hostname: HOST,
            path: FORM_PATH,
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
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });

        req.on('error', (e) => resolve({ status: 'ERROR', body: e.message }));
        req.write(formData);
        req.end();
    });
};

(async () => {
    const fbzx = await getFormPage();
    console.log('fbzx:', fbzx);

    const pageEntries = {
        0: [['entry.1152921546', 'IntPageID_Test'], ['entry.1515637797', 'Opsi 1']],
        1: [['entry.577699138', 'Opsi 1'], ['entry.476679252', 'Opsi 1']],
        2: [['entry.948531731', 'IntPageID_P2'], ['entry.718073519', 'Opsi 1'], ['entry.1323593743', 'Opsi 1']]
    };

    let cumulativeEntries = [];

    for (let pageIdx = 0; pageIdx < 3; pageIdx++) {
        const isLastPage = (pageIdx === 2);
        const pageParams = new URLSearchParams();

        (pageEntries[pageIdx] || []).forEach(([key, value]) => {
            pageParams.append(key, value);
        });

        pageParams.append('fvv', '1');
        pageParams.append('partialResponse', JSON.stringify([cumulativeEntries.length > 0 ? cumulativeEntries : null, null, fbzx]));
        // Use sequential integers as pageHistory
        pageParams.append('pageHistory', Array.from({ length: pageIdx + 1 }, (_, i) => i).join(','));
        pageParams.append('fbzx', fbzx);

        if (isLastPage) {
            pageParams.append('submissionTimestamp', Date.now().toString());
        } else {
            pageParams.append('submissionTimestamp', '-1');
            pageParams.append('continue', '1');
        }

        const result = await makePostRequest(pageParams.toString());
        console.log(`Page ${pageIdx}: status=${result.status}, bodyLen=${result.body.length}`);

        // Save last page response body for inspection
        if (isLastPage) {
            fs.writeFileSync('last-page-response.html', result.body, 'utf8');
            // Check for various confirmation patterns
            const patterns = [
                'freebirdFormviewerViewResponseConfirmationMessage',
                'Respons Anda telah direkam',
                'Your response has been recorded',
                'formResponse',
                'freebirdFormviewerView',
                'confirmedMessage'
            ];
            patterns.forEach(p => {
                console.log(`  Contains "${p}": ${result.body.includes(p)}`);
            });
        }

        // Add to cumulative
        (pageEntries[pageIdx] || []).forEach(([key, value]) => {
            if (key.startsWith('entry.')) {
                const entryId = parseInt(key.replace('entry.', ''));
                if (!isNaN(entryId)) cumulativeEntries.push([null, entryId, [value], 0]);
            }
        });

        if (!isLastPage) await new Promise(r => setTimeout(r, 200));
    }
})();
