const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();

    const url = 'https://docs.google.com/forms/d/e/1FAIpQLSffPaS5ijUqYEcGf3biznBL2Udwqe6aio9jRG16JTD3WMYLHQ/viewform';

    // Log to file stream
    const stream = fs.createWriteStream('debug_structure_output.txt');
    const log = (msg) => {
        console.log(msg);
        stream.write(msg + '\n');
    };

    try {
        await page.goto(url, { waitUntil: 'networkidle2' });

        const data = await page.evaluate(() => {
            const getLoadData = () => {
                const scripts = document.querySelectorAll('script');
                for (const script of scripts) {
                    if (script.textContent.includes('FB_PUBLIC_LOAD_DATA_')) {
                        const match = script.textContent.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(.*?);\s*<\/script>/) ||
                            script.textContent.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(.*);/);
                        if (match && match[1]) {
                            return JSON.parse(match[1]);
                        }
                    }
                }
                return null;
            };

            const rawData = getLoadData();
            if (!rawData) return { error: "No data found" };

            const fields = rawData[1][1];
            const title = rawData[1][8];
            const hiddenInputs = Array.from(document.querySelectorAll('input[type="hidden"]')).map(i => ({
                name: i.name,
                value: i.value
            }));

            // return { fields, title, fbzx: fbzxInput ? fbzxInput.value : 'N/A', pageHistory: pageHistoryInput ? pageHistoryInput.value : 'N/A' };
            return { fields, title, hiddenInputs };
        });

        log(`Form Title: ${data.title}`);
        log(`\n--- ALL HIDDEN INPUTS ---`);
        data.hiddenInputs.forEach(h => log(`${h.name}: ${h.value}`));


        if (data.fields) {
            let pageCount = 0;
            let pageId = 0; // Start at 0

            log(`\n--- PAGE ${pageCount} (ID: ${pageId}) ---`);

            data.fields.forEach((field) => {
                const id = field[0];
                const label = field[1];
                const typeId = field[3];
                const inputData = field[4];

                // Type 8 is Section Header / Page Break
                if (typeId === 8) {
                    pageCount++;
                    pageId = id;
                    log(`\n--- PAGE ${pageCount} (ID: ${pageId}) ---`);
                    log(`[SECTION] Label: ${label}`);
                } else {
                    let entryId = 'N/A';
                    if (inputData && inputData[0] && inputData[0][0]) {
                        entryId = inputData[0][0];
                    }

                    log(`[FIELD] Type: ${typeId} | Entry ID: ${entryId} | Label: ${label}`);

                    if (inputData && inputData[0] && inputData[0][1]) {
                        inputData[0][1].forEach(opt => {
                            if (opt[0]) log(`  - Option: ${opt[0]}`);
                        });
                    }
                }
            });
        }

    } catch (e) {
        log(`Error: ${e.message}`);
    } finally {
        await browser.close();
        stream.end();
    }
})();
