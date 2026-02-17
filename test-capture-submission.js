const puppeteer = require('puppeteer');
const fs = require('fs');

const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSffPaS5ijUqYEcGf3biznBL2Udwqe6aio9jRG16JTD3WMYLHQ/viewform';

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // Intercept network requests
    const capturedRequests = [];
    await page.setRequestInterception(true);

    page.on('request', (req) => {
        if (req.url().includes('formResponse') && req.method() === 'POST') {
            capturedRequests.push({
                url: req.url(),
                method: req.method(),
                postData: req.postData(),
                headers: req.headers()
            });
            console.log('\n=== CAPTURED FORM SUBMISSION ===');
            console.log('URL:', req.url());
            console.log('Method:', req.method());
            console.log('PostData:', req.postData());
        }
        req.continue();
    });

    console.log('Opening form...');
    await page.goto(FORM_URL, { waitUntil: 'networkidle2' });

    // Page 1: Fill in fields
    console.log('Filling Page 1...');

    // Wait for form to load
    await page.waitForSelector('input[type="text"]', { timeout: 10000 });

    // Type in the text field
    const textInputs = await page.$$('input[type="text"]');
    if (textInputs.length > 0) {
        await textInputs[0].type('PuppeteerTest');
    }

    // Click first radio button option
    const radios = await page.$$('div[role="radio"]');
    if (radios.length > 0) {
        await radios[0].click();
    }

    // Click "Next" (Berikutnya / Selanjutnya)
    console.log('Clicking Next...');
    const nextButtons = await page.$$('span.NPEfkd');
    let nextButton = null;
    for (const btn of nextButtons) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text.includes('Berikutnya') || text.includes('Next') || text.includes('Selanjutnya') || text.includes('Lanjut')) {
            nextButton = btn;
            break;
        }
    }

    if (!nextButton) {
        // Try finding by a different selector
        const allButtons = await page.$$('div[role="button"]');
        for (const btn of allButtons) {
            const text = await page.evaluate(el => el.textContent, btn);
            console.log('Button found:', text.trim());
            if (text.includes('Berikutnya') || text.includes('Next') || text.includes('Selanjutnya') || text.includes('Lanjut')) {
                nextButton = btn;
                break;
            }
        }
    }

    if (nextButton) {
        await nextButton.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => { });
        await new Promise(r => setTimeout(r, 2000));
    } else {
        console.log('ERROR: Could not find Next button');
    }

    // Page 2: Fill in fields
    console.log('Filling Page 2...');
    const radios2 = await page.$$('div[role="radio"]');
    for (const radio of radios2.slice(0, 2)) {
        await radio.click();
        await new Promise(r => setTimeout(r, 300));
    }

    // Click Next again
    const nextButtons2 = await page.$$('div[role="button"]');
    let nextButton2 = null;
    for (const btn of nextButtons2) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text.includes('Berikutnya') || text.includes('Next') || text.includes('Selanjutnya') || text.includes('Lanjut')) {
            nextButton2 = btn;
            break;
        }
    }

    if (nextButton2) {
        await nextButton2.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => { });
        await new Promise(r => setTimeout(r, 2000));
    }

    // Page 3: Fill in fields
    console.log('Filling Page 3...');
    const textInputs3 = await page.$$('input[type="text"]');
    if (textInputs3.length > 0) {
        await textInputs3[0].type('PuppeteerTestEnd');
    }

    const radios3 = await page.$$('div[role="radio"]');
    for (const radio of radios3.slice(0, 2)) {
        await radio.click();
        await new Promise(r => setTimeout(r, 300));
    }

    // Find and click "Submit" (Kirim)
    console.log('Clicking Submit...');
    const allButtons3 = await page.$$('div[role="button"]');
    let submitButton = null;
    for (const btn of allButtons3) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text.includes('Kirim') || text.includes('Submit') || text.includes('Terima')) {
            submitButton = btn;
            break;
        }
    }

    if (submitButton) {
        await submitButton.click();
        await new Promise(r => setTimeout(r, 5000)); // Wait for submission
    } else {
        console.log('ERROR: Could not find Submit button');
    }

    // Output captured requests
    console.log('\n\n=== ALL CAPTURED FORM SUBMISSIONS ===');
    console.log('Total captured:', capturedRequests.length);

    const output = JSON.stringify(capturedRequests, null, 2);
    fs.writeFileSync('captured-submission.json', output, 'utf8');
    console.log('Saved to captured-submission.json');

    // Also print the current URL (should be confirmation page)
    console.log('Current URL:', page.url());

    await browser.close();
})();
