const puppeteer = require('puppeteer');

(async () => {
    // const url = 'https://docs.google.com/forms/d/e/1FAIpQLSffPaS5ijUqYEcGf3biznBL2Udwqe6aio9jRG16JTD3WMYLHQ/viewform';
    // Actually better to use the response URL to avoid redirect logic? No viewform is fine.
    const url = 'https://docs.google.com/forms/d/e/1FAIpQLSffPaS5ijUqYEcGf3biznBL2Udwqe6aio9jRG16JTD3WMYLHQ/viewform';

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    try {
        await page.goto(url, { waitUntil: 'networkidle2' });

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

        if (data) {
            const fields = data[1][1];
            fields.forEach(field => {
                const inputData = field[4];
                if (inputData) {
                    const options = inputData[0][1];
                    if (options) {
                        const hasOther = options.some(opt => opt[4] === 1);
                        if (hasOther) {
                            console.log("MATCH FOUND");
                            console.log(JSON.stringify(inputData)); // Single line JSON
                        }
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
