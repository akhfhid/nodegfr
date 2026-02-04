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
            questions: [] // aman buat EJS
        });
    }

    res.render('index', {
        url,
        questions: formData.questions
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

app.post('/execute-links', express.json(), express.urlencoded({ extended: true }), (req, res) => {
    let urlsuccess = 0;
    let urlLinkStatus = [];
    let delay = 1000;

    // Handle both 'urls' and 'urls[]' and ensure it's an array
    let urlsVal = req.body.urls || req.body['urls[]'];
    if (!urlsVal) return res.status(400).json({ error: 'No URLs provided' });
    const urlsToSend = Array.isArray(urlsVal) ? urlsVal : [urlsVal];
    let promises = urlsToSend.map((u) => {
        return new Promise((resolve) => {
            setTimeout(function () {
                https.get(u, (response) => {
                    urlLinkStatus.push({ u, s: response.statusCode });
                    if (response.statusCode == 200) {
                        urlsuccess++;
                    }
                    console.log(u, response.statusCode);
                    resolve();
                });
            }, delay);
        });
    });

    Promise.all(promises).then(() => {
        res.send([{ WARNING: "RETURN AFTER RESPOND, DO NOT RELOAD HERE", urlsuccess, targetCount: urlsToSend.length, urlsToSend, urlLinkStatus }]);
    });
});

app.listen(PORT, () => {
    console.log(`Example app listening on port ${PORT}`);
});

function decodeToGoogleFormUrl(baseUrl, data, selections = []) {
    baseUrl = baseUrl.replace(/viewform/, 'formResponse');
    const urlParams = new URLSearchParams();

    for (const entry of data) {
        if (entry.name == "url") {
            continue;
        }
        const name = entry.name;
        const isMultipleChoice = entry.checkbox;
        const hasOtherOption = entry.hasOtherOption;
        const items = entry.items;
        let selectedResult;

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
            if (selectedResult.isOtherOption) {
                urlParams.append(name + '.other_option_response', selectedResult.option);
                urlParams.append(name, '__other_option__');
            } else {
                urlParams.append(name, selectedResult.option);
            }
            selections.push({ name, values: [selectedResult.option] });
        }
    }

    return `${baseUrl}&${urlParams.toString()}`;
}

function parseData(formData) {
    const remappedOutput = [];

    for (const [entry, value] of Object.entries(formData)) {
        if (entry.startsWith("url") || entry.startsWith("respondCount")) continue;

        // Match keys like entry.123_answers or entry.123_answers[]
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

                if (lines.length > 1) {
                    const baseChance = parseFloat(Array.isArray(chancesArray) ? chancesArray[i] : chancesArray) || 0;
                    const distributedChance = baseChance / lines.length;
                    lines.forEach(line => {
                        items.push({
                            option: line,
                            chance: distributedChance,
                            isOtherOption: false
                        });
                    });
                } else {
                    let isOtherOption = (otherOptionResponse == answer);
                    const chance = Array.isArray(chancesArray) ? chancesArray[i] : chancesArray;
                    const newAnswer = {
                        option: answer,
                        chance: chance || 0,
                        isOtherOption
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

        const pageTitle = await page.title();
        console.log(`[SCRAPER] Page Title: ${pageTitle}`);

        if (pageTitle.toLowerCase().includes('sign in') || pageTitle.toLowerCase().includes('login')) {
            console.error('[SCRAPER] Login required or restricted form.');
            return { error: 'Login required', questions: [] };
        }
        const formData = await page.evaluate(() => {
            const questions = [];
            const typeCounts = {};
            const questionEls = document.querySelectorAll('.Qr7Oae');
            let externalInputIndex = 0;

            questionEls.forEach((el, i) => {
                const questionTextEl = el.querySelector('.M7eMe');
                const questionTitle = questionTextEl ? questionTextEl.innerText.trim() : 'Untitled question';

                let name = null;
                const inputEl = el.querySelector('input[name^="entry."], textarea[name^="entry."]');
                if (inputEl) {
                    name = inputEl.getAttribute('name');
                } else {
                    const radioOrCheckInput = el.querySelector('input[type="radio"][name^="entry."], input[type="checkbox"][name^="entry."]');
                    if (radioOrCheckInput) {
                        name = radioOrCheckInput.getAttribute('name');
                    }
                }

                let type = 'Unknown';
                if (el.querySelector('.zwllIb')) type = 'Multiple Choice';
                else if (el.querySelector('.lLfZXe.fnxRtf.EzyPc')) type = 'Multiple Choice Grid';
                else if (el.querySelector('.V4d7Ke.wzWPxe.OIC90c')) type = 'Checkbox Grid';
                else if (el.querySelector('.ghIlv.s6sSOd')) type = 'Rating';
                else if (el.querySelector('.Zki2Ve')) type = 'Linear Scale';
                else if (el.querySelector('[role=option]')) type = 'Dropdown';
                else if (el.querySelector('.eBFwI')) type = 'Checkboxes';
                else if (el.querySelector('textarea')) type = 'Paragraph';
                else if (el.querySelector('input[type="text"]')) type = 'Short Answer';

                if (type == "Unknown") return;

                typeCounts[type] = (typeCounts[type] || 0) + 1;

                if (name == null && type != "Unknown") {
                    name = externalInputIndex;
                    externalInputIndex++;
                } else if (name) {
                    name = name.split('_')[0];
                }

                let hasOtherOptions = false;
                const options = [];
                if (type === 'Multiple Choice') {
                    el.querySelectorAll('.zwllIb:not(.zfdaxb)').forEach(opt => {
                        const text = opt.innerText.trim();
                        options.push(text);
                    });
                    if (el.querySelector('.zfdaxb')) {
                        hasOtherOptions = true;
                    }
                } else if (type === 'Dropdown') {
                    el.querySelectorAll('.OIC90c[role="option"]').forEach(opt => {
                        const text = opt.innerText.trim();
                        if (text) options.push(text);
                    });
                } else if (type === 'Checkboxes') {
                    el.querySelectorAll('.eBFwI:not(.RVLOe)').forEach(opt => {
                        const text = opt.innerText.trim();
                        if (text) options.push(text);
                    });
                    if (el.querySelector('.RVLOe')) {
                        hasOtherOptions = true;
                    }
                } else if (type === "Linear Scale") {
                    const numbersInEl = Array.from(el.querySelectorAll('.Zki2Ve')).map(e => e.innerText.trim());
                    if (numbersInEl.length > 1) {
                        const min = parseInt(numbersInEl[0]);
                        const max = parseInt(numbersInEl[numbersInEl.length - 1]);
                        for (let i = min; i <= max; i++) {
                            options.push(i);
                        }
                    } else {
                        options.push("Scale unavailable");
                    }
                } else if (type === "Rating") {
                    type = "Linear Scale";
                    el.querySelectorAll('.UNQpic').forEach((r) => {
                        options.push(r.textContent.trim());
                    });
                } else if (type === "Multiple Choice Grid") {
                    const gridOptions = [];
                    el.querySelector('.ssX1Bd.KZt9Tc').querySelectorAll('.OIC90c').forEach((c) => {
                        gridOptions.push(c.textContent);
                    });
                    el.querySelectorAll('.lLfZXe.fnxRtf.EzyPc').forEach((r) => {
                        let rName = r.querySelector("input[name^=entry]").getAttribute('name');
                        rName = rName.split('_')[0];
                        questions.push({ name: rName, question: r.textContent, type: "Multiple Choice", options: gridOptions, hasOtherOptions: false });
                    });
                }

                if (type != "Multiple Choice Grid" && type != "Checkbox Grid") {
                    questions.push({ name, question: questionTitle, type, options, hasOtherOptions });
                }
            });

            let externalInputsName = [];
            document.querySelectorAll('input[name^=entry]:not([name$=sentinel])').forEach((i) => {
                externalInputsName.push(i.name);
            });

            questions.forEach(q => {
                if (typeof q.name === 'number' && externalInputsName[q.name]) {
                    q.name = externalInputsName[q.name];
                }
            });

            return { questions, typeCounts };
        });

        console.log(`[SCRAPER] Found ${formData.questions.length} valid questions.`);
        console.log(`[SCRAPER] Question type breakdown:`, formData.typeCounts);
        await page.close(); // Close the page after scraping
        return { questions: formData.questions };
    } catch (err) {
        console.error(`[SCRAPER] Error: ${err.message}`);
        if (page) await page.close(); // Ensure page is closed on error
        return { error: err.message, questions: [] };
    }
}