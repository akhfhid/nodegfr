// Test scraping specific form
const puppeteer = require('puppeteer');

const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSctkwDOrFYNPzcOQRYmixTpyjDaXnKJW9lY85W5rlX-IJuDxw/viewform';

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

        fields.forEach((field, index) => {
            const typeId = field[3];

            if (typeId === 8) {
                const pageId = field[0];
                const label = field[1];

                type8Fields.push({
                    index,
                    pageId,
                    label: label || 'Untitled Section',
                    typeId
                });

                if (pageId) {
                    pageHistory.push(pageId);
                }
                pageCount++;
            }
        });

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

    if (result.type8Fields && result.type8Fields.length > 0) {
        console.log('\n📄 Section Headers Found:');
        result.type8Fields.forEach(section => {
            console.log(`  - [${section.index}] ID: ${section.pageId}, Label: "${section.label}"`);
        });
    } else {
        console.log('\n⚠️  NO TYPE 8 (Section Headers) FOUND - This is a SINGLE-PAGE form!');
    }

    await browser.close();
})();
