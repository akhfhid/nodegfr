const express = require('express');
const http = require('http');
const https = require('https');
const puppeteer = require('puppeteer');
const { Faker, id_ID } = require('@faker-js/faker');
const path = require('path');

const app = express();
const PORT = 3000;

console.log('PUBLIC DIR:', path.join(__dirname, 'public'));

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

const RESPOND_COUNT_HARD_LIMIT = 999;
const HARD_CODED_NAMEFAKER = true;

const faker = new Faker({
    locale: [id_ID]
});
faker.locale = 'id_ID';

app.get('/scrape', async (req, res) => {
    const url = req.query.url;

    const formData = await scrape(url);

    if (!formData || !formData.questions) {
        return res.render('index', {
            url,
            questions: [],
            pageCount: 0
        });
    }

    res.render('index', {
        url,
        questions: formData.questions,
        pageCount: formData.pageCount || 0,
        pageHistoryStr: formData.pageHistoryStr || "0",
        formTitle: formData.title || "Google Form"
    });
});


app.get('/', (req, res) => {
    res.render('home', {
        formurlfail: req.query.formurlfail ?? null
    });
});


app.post('/save-probabilities', express.json(), express.urlencoded({ extended: true }), (req, res) => {
    const formData = req.body;
    let respondCount = parseInt(req.body.respondCount) || 1;
    if (respondCount > RESPOND_COUNT_HARD_LIMIT) { respondCount = RESPOND_COUNT_HARD_LIMIT; }

    let baseUrl = formData.url;
    let data = parseData(formData);
    let nameFakerEntry, cityFakerEntry, genderFakerEntry, emailFakerEntry;
    let newData = [];
    let urlsToSend = [];

    // Summary data for charts
    let stats = {}; // { questionName: { option: count } }

    for (const entry of data) {
        if (entry.name == "url" || entry.name == "pageCount" || entry.name == "manualPageCount" || entry.name == "pageHistoryStr") {
            continue;
        }

        if (formData['name-faker'] && entry.name == formData['name-faker']) {
            nameFakerEntry = entry;
        } else if (formData['gender-faker'] && entry.name == formData['gender-faker']) {
            genderFakerEntry = entry;
        } else if (formData['city-faker'] && entry.name == formData['city-faker']) {
            cityFakerEntry = entry;
        } else if (formData['email-faker'] && entry.name == formData['email-faker']) {
            emailFakerEntry = entry;
        } else {
            newData.push(entry);
        }
        stats[entry.name] = {
            _questionText: formData[`${entry.name}_text`] || entry.name,
            _type: entry.checkbox ? 'Checkboxes' : 'Single Choice'
        };
    }

    for (let i = 0; i < respondCount; i++) {
        let fakerGender = Math.random() < 0.3 ? 'Laki-laki' : 'Perempuan';
        let fakerName = faker.person.firstName(fakerGender == "Perempuan" ? "female" : "male");
        let fakerCity = faker.location.city();
        let fakerEmail = faker.internet.email().replace(/@.+$/, '@gmail.com');
        if (Math.random() < 0.7) {
            fakerName = fakerName.toLowerCase();
        }

        // Track selections for stats
        const selections = [];
        const formUrl = decodeToGoogleFormUrl(baseUrl, newData, selections);

        // Populate stats for the standard fields
        selections.forEach(sel => {
            if (!stats[sel.name]) stats[sel.name] = {};
            sel.values.forEach(val => {
                stats[sel.name][val] = (stats[sel.name][val] || 0) + 1;
            });
        });

        const urlParams = new URLSearchParams();
        if (formData["name-faker"]) {
            urlParams.append(nameFakerEntry.name, fakerName);
            stats[nameFakerEntry.name][fakerName] = (stats[nameFakerEntry.name][fakerName] || 0) + 1;
        }
        if (formData["gender-faker"]) {
            urlParams.append(genderFakerEntry.name, fakerGender);
            stats[genderFakerEntry.name][fakerGender] = (stats[genderFakerEntry.name][fakerGender] || 0) + 1;
        }
        if (formData["city-faker"]) {
            urlParams.append(cityFakerEntry.name, fakerCity);
            stats[cityFakerEntry.name][fakerCity] = (stats[cityFakerEntry.name][fakerCity] || 0) + 1;
        }
        if (formData["email-faker"]) {
            urlParams.append(emailFakerEntry.name, fakerEmail);
            stats[emailFakerEntry.name][fakerEmail] = (stats[emailFakerEntry.name][fakerEmail] || 0) + 1;
        }
        const newForm = `${formUrl}&${urlParams.toString()}`;
        urlsToSend.push(newForm);
    }

    res.json({ urlsToSend, stats });
});

// --- JOB MANAGEMENT ---
let globalJob = {
    isRunning: false,
    total: 0,
    current: 0,
    success: 0,
    fail: 0,
    logs: [],
    startTime: null
};

app.post('/execute-links', express.json(), express.urlencoded({ extended: true }), (req, res) => {
    if (globalJob.isRunning) {
        return res.status(409).json({ error: 'A job is already running' });
    }

    // 1. Get Params
    let urlsVal = req.body.urls || req.body['urls[]'];
    if (!urlsVal) return res.status(400).json({ error: 'No URLs provided' });

    // Ensure array
    const urlsToSend = Array.isArray(urlsVal) ? urlsVal : [urlsVal];

    // Config
    const concurrency = parseInt(req.body.concurrency) || 5;
    const delay = parseInt(req.body.delay) || 1000;
    const manualPageCount = parseInt(req.body.manualPageCount) || 0;
    const pageHistoryStr = req.body.pageHistoryStr || null;

    // 2. Init Job
    globalJob = {
        isRunning: true,
        total: urlsToSend.length,
        current: 0,
        success: 0,
        fail: 0,
        logs: [],
        startTime: Date.now()
    };

    // 3. Start Background Worker (Fire and Forget)
    runBackgroundJob(urlsToSend, concurrency, delay, manualPageCount, pageHistoryStr);

    // 4. Return immediately
    res.json({ message: 'Job started', total: urlsToSend.length });
});

app.get('/job-status', (req, res) => {
    res.json(globalJob);
});

app.post('/stop-job', (req, res) => {
    if (!globalJob.isRunning) return res.json({ message: 'No job running' });
    globalJob.isRunning = false;
    res.json({ message: 'Stop signal sent' });
});

async function runBackgroundJob(urls, concurrency, delay, manualPageCount = 0, pageHistoryStr = null) {
    console.log(`[JOB] Starting background job: ${urls.length} items. Threads: ${concurrency}. Manual Pages: ${manualPageCount}. Page History: ${pageHistoryStr}`);

    let currentIndex = 0;
    const activeWorkers = [];

    const worker = async (workerId) => {
        while (currentIndex < urls.length && globalJob.isRunning) {
            const index = currentIndex++;
            const u = urls[index];

            let finalUrl = u;

            // PRIORITY: If explicit Page ID string exists, use it.
            if (pageHistoryStr && pageHistoryStr !== "0") {
                if (finalUrl.includes('pageHistory=')) {
                    finalUrl = finalUrl.replace(/pageHistory=[^&]*/, `pageHistory=${pageHistoryStr}`);
                } else {
                    finalUrl += `&pageHistory=${pageHistoryStr}`;
                }
            }
            // FALLBACK: If explicit ID missing but Manual Count > 0, generate sequence 0,1,2...
            // (Note: This is risky for forms with specific IDs, but OK if scraping failed entirely)
            else if (manualPageCount > 0) {
                const pageHistory = Array.from({ length: manualPageCount + 1 }, (_, i) => i).join(',');
                if (finalUrl.includes('pageHistory=')) {
                    finalUrl = finalUrl.replace(/pageHistory=[^&]*/, `pageHistory=${pageHistory}`);
                } else {
                    finalUrl += `&pageHistory=${pageHistory}`;
                }
            }

            try {
                const status = await new Promise((resolve) => {
                    const req = https.get(finalUrl, (response) => {
                        resolve(response.statusCode);
                    });
                    req.on('error', (e) => {
                        resolve('ERROR');
                    });
                });

                if (status == 200 || status == 201) {
                    globalJob.success++;
                } else {
                    console.log(`[JOB FAIL] Status: ${status} | URL: ...${u.slice(-50)}`);
                    // Check if it's a redirect (common in Google Forms)
                    if (status >= 300 && status < 400) {
                        console.log(`[JOB INFO] Redirect detected. Usually means success but we aren't following it.`);
                        // For now, let's count it as success to verify
                        globalJob.success++;
                    } else {
                        globalJob.fail++;
                    }
                }
            } catch (err) {
                globalJob.fail++;
            }

            globalJob.current++;

            if (delay > 0) await new Promise(r => setTimeout(r, delay));
        }
    };

    const numWorkers = Math.min(concurrency, urls.length);
    for (let i = 0; i < numWorkers; i++) {
        activeWorkers.push(worker(i + 1));
    }

    await Promise.all(activeWorkers);
    globalJob.isRunning = false;
    console.log(`[JOB] Finished. Success: ${globalJob.success}, Fail: ${globalJob.fail}`);
}

app.listen(PORT, () => {
    console.log(`Example app listening on port ${PORT}`);
});

function decodeToGoogleFormUrl(baseUrl, data, selections = []) {
    baseUrl = baseUrl.replace(/viewform/, 'formResponse');
    const urlParams = new URLSearchParams();

    for (const entry of data) {
        if (entry.name == "url" || entry.name == "pageCount" || entry.name == "manualPageCount" || entry.name == "pageHistoryStr") {
            continue;
        }
        const name = entry.name;
        const isMultipleChoice = entry.checkbox;
        const hasOtherOption = entry.hasOtherOption;
        const items = entry.items;
        let selectedResult;
        console.log(`[DECIDER] Question: ${name} (${items.length} options)`);
        items.forEach(i => console.log(` - ${i.option.substring(0, 10)}... : ${i.chance}% (Other: ${i.isOtherOption})`));

        if (isMultipleChoice) {
            selectedResult = selectIndependentOptions(items);
            const selectionValues = [];
            selectedResult.forEach(option => {
                if (hasOtherOption && option.isOtherOption) {
                    urlParams.append(name + '.other_option_response', option.option);
                    urlParams.append(name, '__other_option__');
                } else {
                    urlParams.append(name, option.option);
                }
                selectionValues.push(option.option);
            });
            selections.push({ name, values: selectionValues });
        } else {
            selectedResult = selectWeightedRandomItem(items);

            console.log(`[DECIDER] Selected: ${selectedResult.option} (isOther: ${selectedResult.isOtherOption})`);

            if (selectedResult.isOtherOption) {
                urlParams.append(name + '.other_option_response', selectedResult.option);
                urlParams.append(name, '__other_option__');
            } else {
                urlParams.append(name, selectedResult.option);
            }
            selections.push({ name, values: [selectedResult.option] });
        }
    }

    // Fix for Multi-Page Forms:
    // Priority: Manual Override > Scraped Data > Default 0
    let pages = 0;
    let usedExtractedHistory = false;
    let pageHistory = "0";

    // Check for manual override passed in data
    const manualOverride = data.find(e => e.name === 'manualPageCount');
    const extractedHistory = data.find(e => e.name === 'pageHistoryStr')?.value;

    if (manualOverride && parseInt(manualOverride.value) > 0) {
        pages = parseInt(manualOverride.value);
        console.log(`[URL BUILDER] Using Manual Page Count: ${pages}`);
        pageHistory = Array.from({ length: pages + 1 }, (_, i) => i).join(',');
    } else if (extractedHistory && extractedHistory !== "0") {
        console.log(`[URL BUILDER] Using Extracted Page History: ${extractedHistory}`);
        pageHistory = extractedHistory;
        usedExtractedHistory = true;
    } else {
        pages = parseInt(data.find(e => e.name === 'pageCount')?.value) || 0;
        pageHistory = Array.from({ length: pages + 1 }, (_, i) => i).join(',');
    }

    urlParams.append('pageHistory', pageHistory);

    console.log(`[URL BUILDER] Final Page Count: ${pages} -> pageHistory: ${pageHistory}`);
    console.log(`[URL BUILDER] Full Params: ${urlParams.toString()}`);

    return `${baseUrl}&${urlParams.toString()}`;
}

function parseData(formData) {
    const remappedOutput = [];

    for (const [entry, value] of Object.entries(formData)) {
        if (entry === 'pageCount' || entry === 'manualPageCount' || entry === 'pageHistoryStr') {
            remappedOutput.push({ name: entry, value: value });
            continue;
        }

        if (entry.startsWith("url") || entry.startsWith("respondCount")) continue;
        if (entry.includes('_answers')) {
            const questionId = entry.split('_')[0];
            const multipleChoice = formData[`${questionId}_isMultipleChoice`] || formData[`${questionId}_isMultipleChoice[]`];
            const otherOptionResponse = formData[`${questionId}.other_option_response`] || formData[`${questionId}.other_option_response[]`];
            const hasOtherOption = formData[`${questionId}.is_other_option`] || formData[`${questionId}.is_other_option[]`];
            const chances = formData[`${questionId}_chances`] || formData[`${questionId}_chances[]`];
            const items = [];

            const answers = Array.isArray(value) ? value : [value];
            const chancesArray = Array.isArray(chances) ? JSON.parse(JSON.stringify(chances)) : [chances]; // clone to be safe

            answers.forEach((answer, i) => {
                const answerStr = String(answer);
                const lines = answerStr.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

                // Determine if this answer block (original text) matches "Other"
                let isOtherOptionBlock = false;
                if (Array.isArray(otherOptionResponse)) {
                    isOtherOptionBlock = otherOptionResponse.includes(answerStr);
                } else {
                    isOtherOptionBlock = (otherOptionResponse == answerStr);
                }

                if (lines.length > 1) {
                    const baseChance = parseFloat(Array.isArray(chancesArray) ? chancesArray[i] : chancesArray) || 0;
                    const distributedChance = baseChance / lines.length;
                    lines.forEach(line => {
                        items.push({
                            option: line,
                            chance: distributedChance,
                            isOtherOption: isOtherOptionBlock
                        });
                    });
                } else {
                    const chance = Array.isArray(chancesArray) ? chancesArray[i] : chancesArray;
                    const newAnswer = {
                        option: answer,
                        chance: chance || 0,
                        isOtherOption: isOtherOptionBlock
                    };
                    items.push(newAnswer);
                }
            });
            const isMultipleChoice = multipleChoice ? (Array.isArray(multipleChoice) ? multipleChoice[0] : multipleChoice) : false;
            remappedOutput.push({
                name: questionId,
                checkbox: isMultipleChoice === 'true' || isMultipleChoice === true,
                hasOtherOption: hasOtherOption ?? false,
                items
            });
        }
    }
    return remappedOutput;
}

function selectIndependentOptions(optionsWithProbabilities) {
    const selectedOptions = [];
    for (const item of optionsWithProbabilities) {
        const chance = parseFloat(item.chance);
        const probability = chance > 1 ? chance / 100 : chance;
        if (Math.random() < probability) {
            selectedOptions.push(item);
        }
    }
    return selectedOptions;
}

function selectWeightedRandomItem(optionsWithWeights) {
    let totalWeight = 0;
    for (const item of optionsWithWeights) {
        totalWeight += parseFloat(item.chance);
    }
    const randomNumber = Math.random() * totalWeight;
    let cumulativeWeight = 0;

    for (const item of optionsWithWeights) {
        cumulativeWeight += parseFloat(item.chance);
        if (randomNumber < cumulativeWeight) {
            return item;
        }
    }
    return optionsWithWeights[optionsWithWeights.length - 1];
}

let browserInstance = null;

async function getBrowser() {
    if (!browserInstance) {
        browserInstance = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    }
    return browserInstance;
}

async function scrape(url) {
    let browser;
    let page;
    try {
        console.log(`[SCRAPER] Scraping URL: ${url}`);
        browser = await getBrowser();
        page = await browser.newPage();

        // Wait for network to be idle
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // DEBUG: Listen to browser console
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));

        const pageTitle = await page.title();
        console.log(`[SCRAPER] Page Title: ${pageTitle}`);

        if (pageTitle.toLowerCase().includes('sign in') || pageTitle.toLowerCase().includes('login')) {
            console.error('[SCRAPER] Login required or restricted form.');
            await page.close();
            return { error: 'Login required', questions: [] };
        }
        // Extract clean form title
        const formTitle = await page.evaluate(() => {
            const heading = document.querySelector('div[role="heading"][aria-level="1"]') || document.querySelector('div[role="heading"]') || document.querySelector('.F9yp7e');
            return heading ? heading.innerText.trim() : document.title.replace(' - Google Forms', '');
        });

        const formData = await page.evaluate(() => {
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
            if (!rawData) return { error: "Failed to find form data (FB_PUBLIC_LOAD_DATA_)", questions: [] };

            const questions = [];
            const typeCounts = {};
            let pageCount = 0;
            const pageHistory = [0];

            const fields = rawData[1][1];
            if (!fields) return { error: "No fields found in form data", questions: [] };

            fields.forEach((field) => {
                const label = field[1];
                const typeId = field[3];
                const inputData = field[4];

                console.log(`[SCRAPER RAW] Type: ${typeId}, Label: ${label ? label.substring(0, 20) : 'N/A'}`);

                if (!inputData && typeId !== 8) {
                    return;
                }

                // TYPE 8 = Section Header / Page Break logic first
                if (typeId === 8) {
                    console.log(`[SCRAPER RAW] Type 8 Found!`);
                    try {
                        const pageId = field[0];
                        if (pageId) {
                            pageHistory.push(pageId);
                        }
                    } catch (e) {
                        console.error(`[SCRAPER] Error extracting Page ID: ${e.message}`);
                    }

                    questions.push({
                        name: `section_header_${pageCount}`,
                        question: field[1] || "Untitled Section",
                        type: 'SectionHeader',
                        options: [],
                        hasOtherOptions: false
                    });

                    pageCount++;
                    return; // Done with Type 8, next field
                }

                // For other types, we need inputData
                if (!inputData) return;

                let entryId = inputData[0][0];
                let questionType = 'Unknown';
                let options = [];
                let linearScaleLabels = [null, null]; // [startLabel, endLabel]
                let hasOtherOptions = false;

                switch (typeId) {
                    case 0: questionType = 'Short Answer'; break;
                    case 1: questionType = 'Paragraph'; break;
                    case 2:
                        questionType = 'Multiple Choice';
                        if (inputData[0][1]) {
                            options = inputData[0][1].map(opt => opt[0]).filter(opt => opt !== "");
                            hasOtherOptions = inputData[0][1].some(opt => opt[4] == 1); // Check for "other" flag
                        }
                        break;
                    case 3:
                        questionType = 'Dropdown';
                        if (inputData[0][1]) {
                            options = inputData[0][1].map(opt => opt[0]).filter(opt => opt !== "");
                        }
                        break;
                    case 4:
                        questionType = 'Checkboxes';
                        if (inputData[0][1]) {
                            options = inputData[0][1].map(opt => opt[0]).filter(opt => opt !== "");
                            hasOtherOptions = inputData[0][1].some(opt => opt[4] == 1);
                        }
                        break;
                    case 5:
                        questionType = 'Linear Scale';
                        if (inputData[0][1]) {
                            options = inputData[0][1].map(opt => opt[0]);
                        }
                        // Extract Start/End Labels (standard indices based on observation)
                        if (inputData[0][3]) linearScaleLabels[0] = inputData[0][3];
                        if (inputData[0][4]) linearScaleLabels[1] = inputData[0][4];
                        break;
                    case 7:
                        questionType = 'Grid';
                        // Skip Grid for MVP stability
                        return;
                        break;
                    case 9: questionType = 'Date'; break;
                    case 10: questionType = 'Time'; break;
                    default: return;
                }

                if (questionType !== 'Unknown' && questionType !== 'Grid') {
                    if (entryId) {
                        typeCounts[questionType] = (typeCounts[questionType] || 0) + 1;
                        questions.push({
                            name: `entry.${entryId}`,
                            question: label,
                            type: questionType,
                            options: options,
                            linearScaleLabels: linearScaleLabels, // Pass labels
                            hasOtherOptions: hasOtherOptions
                        });
                    }
                }
            });

            return { questions, typeCounts, pageCount, pageHistoryStr: pageHistory.join(',') };
        });

        if (formData.error) {
            console.error(`[SCRAPER] Error extracting data: ${formData.error}`);
            await page.close();
            return { error: formData.error, questions: [], pageCount: 0, pageHistoryStr: "0" };
        }

        const validData = formData.questions.filter(q => q);
        console.log(`[SCRAPER] Found ${validData.length} valid questions.`);

        // Include formTitle in the return object
        return {
            questions: validData,
            pageCount: formData.pageCount,
            pageHistoryStr: formData.pageHistoryStr,
            title: formTitle
        };
    } catch (err) {
        console.error(`[SCRAPER] Error: ${err.message}`);
        if (page) await page.close();
        return { error: err.message, questions: [] };
    }
}