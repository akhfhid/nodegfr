const puppeteer = require('puppeteer');

(async () => {
    const url = 'https://docs.google.com/forms/d/e/1FAIpQLSffPaS5ijUqYEcGf3biznBL2Udwqe6aio9jRG16JTD3WMYLHQ/viewform';
    console.log(`Debug Scraping: ${url}`);

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    try {
        await page.goto(url, { waitUntil: 'networkidle2' });

        // PAGE 1 SUBMISSION (Dummy)
        console.log("Filling Page 1...");
        // Just click Next if possible, or fill required?
        // Let's assume Page 1 has questions. 
        // We can try to just scrape whatever is loaded.
        // Google Forms usually loads ALL data in FB_PUBLIC_LOAD_DATA_ even if on Page 1?
        // YES. The FB_PUBLIC_LOAD_DATA_ contains definitions for ALL pages.
        // So I don't need to navigate.
        // BUT my script output "Label: null".
        // Maybe I am looking at the wrong index?

        const data = await page.evaluate(() => {
            let scripts = document.getElementsByTagName('script');
            for (let script of scripts) {
                if (script.textContent.includes('FB_PUBLIC_LOAD_DATA_')) {
                    const match = script.textContent.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(.*?);\s*<\/script>/) ||
                        script.textContent.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(.*);/);
                    if (match && match[1]) {
                        return JSON.parse(match[1]);
                    }
                }
            }
            return null;
        });

        if (!data) {
            console.error("No data found");
        } else {
            console.log("Form Data Found. Analyzing Fields...");
            const fields = data[1][1];

            fields.forEach(field => {
                const label = field[1];
                const typeId = field[3];
                const inputData = field[4];

                if (inputData && (typeId === 2 || typeId === 4)) { // Multiple Choice or Checkbox
                    console.log(`\n==================================================`);
                    console.log(`Label: ${label}`);
                    console.log(`Type: ${typeId === 2 ? 'Radio' : 'Checkbox'} (ID: ${typeId})`);
                    console.log(`Main Entry ID: ${inputData[0][0]}`);

                    // Log raw structure for debugging
                    console.log("Raw Options Data (First 2 options + Other):");
                    // inputData[0][1] is options array
                    const options = inputData[0][1];
                    console.log(JSON.stringify(options, null, 2));

                    // Check for "Other" specifically
                    const otherOption = options.find(opt => opt[4] === 1);
                    if (otherOption) {
                        console.log("\n*** OTHER OPTION FOUND ***");
                        console.log("Full Other Option Array:", JSON.stringify(otherOption));
                        console.log("Looking for text input ID...");
                        // Usually, google forms puts the text input ID in a different place if it's not standard
                        // Let's check inputData[0][something else]?
                        console.log("Full Question Data (inputData):", JSON.stringify(inputData, null, 2));
                    }
                }
            });
        }

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
})();
