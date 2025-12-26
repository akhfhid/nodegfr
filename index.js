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


app.post('/save-probabilities', express.urlencoded({ extended: true }), (req, res) => {
    const formData = req.body;
    let respondCount = parseInt(req.body.respondCount) || 1;
    if (respondCount > RESPOND_COUNT_HARD_LIMIT) { respondCount = RESPOND_COUNT_HARD_LIMIT; }

    let baseUrl = formData.url;
    let data = parseData(formData);
    let nameFakerEntry, cityFakerEntry, genderFakerEntry, emailFakerEntry;
    let newData = [];
    let urlsToSend = [];

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
    }

    for (let i = 0; i < respondCount; i++) {
        let fakerGender = Math.random() < 0.3 ? 'Laki-laki' : 'Perempuan';
        let fakerName = faker.person.firstName(fakerGender == "Perempuan" ? "female" : "male");
        let fakerCity = faker.location.city();
        let fakerEmail = faker.internet.email().replace(/@.+$/, '@gmail.com');
        if (Math.random() < 0.7) {
            fakerName = fakerName.toLowerCase();
        }
        const formUrl = decodeToGoogleFormUrl(baseUrl, newData);
        const urlParams = new URLSearchParams();
        if (formData["name-faker"]) {
            urlParams.append(nameFakerEntry.name, fakerName);
        }
        if (formData["gender-faker"]) {
            urlParams.append(genderFakerEntry.name, fakerGender);
        }
        if (formData["city-faker"]) {
            urlParams.append(cityFakerEntry.name, fakerCity);
        }
        if (formData["email-faker"]) {
            urlParams.append(emailFakerEntry.name, fakerEmail);
        }
        const newForm = `${formUrl}&${urlParams.toString()}`;
        urlsToSend.push(newForm);
    }

    res.render('buffer', { urlsToSend });
});

app.post('/execute-links', express.urlencoded({ extended: true }), (req, res) => {
    let urlsuccess = 0;
    let urlLinkStatus = [];
    let delay = 1000;
    const urlsToSend = req.body.urls;
    let promises = urlsToSend.map((u) => {
        return new Promise((resolve) => {
            setTimeout(function() {
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

function decodeToGoogleFormUrl(baseUrl, data) {
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
            selectedResult.forEach(option => {
                if (hasOtherOption && option.isOtherOption) {
                    urlParams.append(name + '.other_option_response', option.option);
                    urlParams.append(name, '__other_option__');
                } else {
                    urlParams.append(name, option.option);
                }
            });
        } else {
            selectedResult = selectWeightedRandomItem(items);
            if (selectedResult.isOtherOption) {
                urlParams.append(name + '.other_option_response', selectedResult.option);
                urlParams.append(name, '__other_option__');
            } else {
                urlParams.append(name, selectedResult.option);
            }
        }
    }

    return `${baseUrl}&${urlParams.toString()}`;
}

function parseData(formData) {
    const remappedOutput = [];

    for (const [entry, value] of Object.entries(formData)) {
        if (entry === "url" || entry === "respondCount") continue;
        if (entry.endsWith('_answers')) {
            const questionId = entry.split('_')[0];
            const multipleChoice = formData[`${questionId}_isMultipleChoice`];
            const otherOptionResponse = formData[`${questionId}.other_option_response`];
            const hasOtherOption = formData[`${questionId}.is_other_option`];
            const items = [];
            value.forEach((answer, i) => {
                let isOtherOption = otherOptionResponse == answer;
                const newAnswer = {
                    option: answer,
                    chance: formData[`${questionId}_chances`][i] || 0,
                    isOtherOption
                };
                items.push(newAnswer);
            });
            const isMultipleChoice = multipleChoice ? multipleChoice[0] : false;
            remappedOutput.push({
                name: questionId,
                checkbox: isMultipleChoice,
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

async function scrape(url) {
    try {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2' });
        const formData = await page.evaluate(() => {
            const questions = [];
            const questionEls = document.querySelectorAll('.Qr7Oae');
            let externalInputIndex = 0;
            questionEls.forEach((el, i) => {
                const questionTextEl = el.querySelector('.M7eMe');
                const question = questionTextEl ? questionTextEl.innerText.trim() : 'Untitled question';

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

                if (name == null && type != "Unknown") {
                    name = externalInputIndex;
                    externalInputIndex++;
                } else {
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
                        if (el.querySelector('.RVLOe')) {
                            hasOtherOptions = true;
                        }
                    });
                } else if (type === "Linear Scale") {
                    const numbersInEl = Array.from(el.querySelectorAll('.Zki2Ve')).map(e => e.innerText.trim());
                    const numbers = numbersInEl.length > 0
                        ? numbersInEl
                        : Array.from(document.querySelectorAll('.Zki2Ve')).map(e => e.innerText.trim());

                    if (numbers.length > 1) {
                        const min = parseInt(numbers[0]);
                        const max = parseInt(numbers[numbers.length - 1]);
                        range = [];
                        for (let i = min; i <= max; i++) {
                            range.push(i);
                        }
                        options.push(...range);
                    } else {
                        options.push("Scale unavailable");
                    }
                } else if (type === "Rating") {
                    type = "Linear Scale";
                    el.querySelector('.vp2Xfc').querySelectorAll('.UNQpic').forEach((r) => {
                        options.push(r.textContent.trim());
                    });
                } else if (type === "Multiple Choice Grid") {
                    const options = [];
                    const row = el.querySelectorAll('.lLfZXe.fnxRtf.EzyPc');
                    el.querySelector('.ssX1Bd.KZt9Tc').querySelectorAll('.OIC90c').forEach((c) => {
                        options.push(c.textContent);
                    });
                    row.forEach((r, i) => {
                        let name = r.querySelector("input[name^=entry]").getAttribute('name');
                        name = name.split('_')[0];
                        questions.push({ name, question: r.textContent, type: "Multiple Choice", options, hasOtherOptions });
                    });
                } else if (type === "Checkbox Grid") {
                    el.querySelector('.ssX1Bd.KZt9Tc').querySelectorAll('.V4d7Ke.OIC90c').forEach((opt) => {
                        options.push(opt.textContent.trim());
                    });

                    el.querySelectorAll('.EzyPc.mxSrOe').forEach((r) => {
                        let name = r.querySelector("input[name^=entry]").getAttribute('name');
                        name = name.split('_')[0];
                        questions.push({ name, question, type: "Checkbox", options, hasOtherOptions });
                    });
                }

                if (type != "Multiple Choice Grid" && type != "Checkbox Grid") {
                    questions.push({ name, question, type, options, hasOtherOptions });
                }
            });
            let externalInputsName = [];
            document.querySelectorAll('input[name^=entry]:not([name$=sentinel])').forEach((i) => { externalInputsName.push(i.name); });

            questions.forEach(q => {
                if (typeof q.name === 'number') {
                    q.name = externalInputsName[q.name];
                }
            });
            return questions;
        });
        await browser.close();

        return { questions: formData };
    } catch (err) {
        console.error(err);
        return { error: 'Scraping failed' };
    }
}