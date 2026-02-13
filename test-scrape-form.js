// Test scraping specific form
const puppeteer = require('puppeteer');

const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSffPaS5ijUqYEcGf3biznBL2Udwqe6aio9jRG16JTD3WMYLHQ/viewform';

(async () => {
    console.log('🔍 Testing Form Scraping...\n');

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();

    await page.goto(FORM_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const result = await page.evaluate(() => {
        const getLoadData = () => {
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
                if (script.textContent.includes('FB_PUBLIC_LOAD_DATA_')) {
                    const match = script.textContent.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(.*?);/) ||
                        script.textContent.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(.*);/);
                    if (match && match[1]) {
                        return JSON.parse(match[1]);
                    }
                }
            }
            return null;
        };

        const rawData = getLoadData();
        if (!rawData) return { error: 'No FB_PUBLIC_LOAD_DATA_ found' };

        const pageHistory = [0];
        let pageCount = 0;
        const type8Fields = [];

        const fields = rawData[1][1];
        if (!fields) return { error: 'No fields found' };

        const allFields = [];

        fields.forEach((field, index) => {
            const id = field[0];
            const label = field[1];
            const typeId = field[3];
            let entryId = null;

            if (field[4] && field[4][0] && field[4][0][0]) {
                entryId = field[4][0][0];
            }

            let options = [];
            if (field[4] && field[4][0] && field[4][0][1]) {
                options = field[4][0][1].map(opt => opt[0]);
            }

            allFields.push({
                index,
                id,
                label: label || 'Untitled',
                typeId,
                entryId,
                options
            });
        });

        return {
            totalFields: fields.length,
            allFields
        };

        return {
            totalFields: fields.length,
            pageCount,
            pageHistory,
            pageHistoryStr: pageHistory.join(','),
            type8Fields
        };
    });

    console.log('📊 Scraping Result:\n');
    console.log(JSON.stringify(result, null, 2));
    console.log('\n✅ pageHistoryStr:', result.pageHistoryStr || '0');
    console.log('📝 Page Count:', result.pageCount);

    if (result.allFields && result.allFields.length > 0) {
        console.log('\n📄 Fields Found:');
        result.allFields.forEach(f => {
            console.log(`  - [${f.index}] Type: ${f.typeId}, ID: ${f.id}, Label: "${f.label}", Entry ID: ${f.entryId}`);
            if (f.options && f.options.length > 0) {
                console.log('    Options:', JSON.stringify(f.options));
            }
        });
    } else {
        console.log('\n⚠️  NO FIELDS FOUND!');
    }

    await browser.close();
})();
