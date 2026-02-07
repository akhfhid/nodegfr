const express = require('express');
const http = require('http');
const https = require('https');
const puppeteer = require('puppeteer');
const { Faker, id_ID } = require('@faker-js/faker');
const path = require('path');

const app = express();
const PORT = 3000;

// Init Prisma
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Auth Dependencies
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const passport = require('./auth');

require('dotenv').config();

console.log('PUBLIC DIR:', path.join(__dirname, 'public'));

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Session Config
app.use(session({
    store: new SQLiteStore({ db: 'sessions.db', dir: '.' }),
    secret: process.env.SESSION_SECRET || 'keyboard cat',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 1 week
}));

// Passport Config
app.use(passport.initialize());
app.use(passport.session());

// Middleware to make 'user' available in all views
app.use((req, res, next) => {
    res.locals.user = req.user || null;
    next();
});

// Authentication Middleware
// Authentication Middleware
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    // Direct redirect to Google Auth for seamless experience
    res.redirect('/auth/google');
}

// Admin Middleware - Only allow autofill.site@gmail.com
const ADMIN_EMAIL = 'autofill.site@gmail.com';

function ensureAdmin(req, res, next) {
    if (!req.isAuthenticated()) {
        return res.redirect('/auth/google');
    }
    if (req.user.email !== ADMIN_EMAIL) {
        return res.status(403).render('home', {
            formurlfail: 'Access Denied. Admin only.'
        });
    }
    return next();
}


// --- ROUTES ---

// Auth Routes
app.get('/login', (req, res) => {
    if (req.isAuthenticated()) return res.redirect('/');
    res.render('login');
});

app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
        // Successful authentication, redirect home.
        res.redirect('/');
    });

app.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        res.redirect('/');
    });
});

// Avatar Proxy Route (to bypass 403/429 issues)
app.get('/user/avatar', ensureAuthenticated, async (req, res) => {
    const avatarUrl = req.user.avatar;
    const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(req.user.name)}&background=random`;

    if (!avatarUrl) return res.redirect(fallbackUrl);

    try {
        // Using native fetch (Node 18+)
        const response = await fetch(avatarUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0' // Mock UA
            }
        });

        if (!response.ok) throw new Error(`Google responded with ${response.status}`);

        // Forward headers (content-type)
        res.setHeader('Content-Type', response.headers.get('content-type'));
        // Prevent caching so switching accounts works immediately
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        // Stream the body
        const reader = response.body.getReader();
        const readable = new (require('stream').Readable)({
            async read() {
                const { done, value } = await reader.read();
                if (done) {
                    this.push(null);
                } else {
                    this.push(Buffer.from(value));
                }
            }
        });
        readable.pipe(res);

    } catch (err) {
        console.error("Avatar Proxy Error:", err.message);
        res.redirect(fallbackUrl);
    }
});

const RESPOND_COUNT_HARD_LIMIT = 999;
const HARD_CODED_NAMEFAKER = true;

const faker = new Faker({
    locale: [id_ID]
});
faker.locale = 'id_ID';



// Global UA Pool
const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0"
];

app.get('/scrape', ensureAuthenticated, async (req, res) => {
    const url = req.query.url;

    // Check if form exists in DB first
    // TODO: optimization later. for now just scrape.

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


app.get('/', async (req, res) => {
    try {
        const packages = await prisma.tokenPackage.findMany({
            where: { active: true },
            orderBy: { tokens: 'asc' }
        });

        res.render('home', {
            formurlfail: req.query.formurlfail ?? null,
            packages: packages
        });
    } catch (err) {
        console.error('Error fetching packages:', err);
        res.render('home', {
            formurlfail: req.query.formurlfail ?? null,
            packages: []
        });
    }
});

// --- MIDTRANS & PAYMENT ROUTES ---
const { snap } = require('./midtrans');

app.post('/api/purchase', ensureAuthenticated, async (req, res) => {
    const { tokens } = req.body;
    const tokenCount = parseInt(tokens);

    // 1. Validate Token Count (Min 1)
    if (isNaN(tokenCount) || tokenCount < 1) {
        return res.status(400).json({ error: "Minimal pembelian adalah 1 responden." });
    }

    // 2. Calculate Price (Server-Side Validation)
    // Flat rate: 1 per token (for testing)
    let rate = 1;

    let totalAmount = tokenCount * rate;
    const packageId = `CUSTOM-${tokenCount}`;

    // 1. Create Order ID
    const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // 2. Save Transaction PENDING
    try {
        await prisma.transaction.create({
            data: {
                id: orderId,
                userId: req.user.id,
                package: packageId,
                amount: totalAmount,
                tokens: tokenCount,
                status: 'PENDING'
            }
        });

        // 3. Request Snap Token
        let parameter = {
            "transaction_details": {
                "order_id": orderId,
                "gross_amount": totalAmount
            },
            "credit_card": {
                "secure": true
            },
            "customer_details": {
                "first_name": req.user.name.split(' ')[0],
                "email": req.user.email,
            }
        };

        const transaction = await snap.createTransaction(parameter);
        const snapToken = transaction.token;

        // Update DB with snapToken
        await prisma.transaction.update({
            where: { id: orderId },
            data: { snapToken: snapToken }
        });

        res.json({ snapToken, orderId });

    } catch (e) {
        console.error("Midtrans Error:", e);
        res.status(500).json({ error: "Failed to create transaction" });
    }
});

app.post('/api/midtrans/notification', express.json(), async (req, res) => {
    try {
        const notificationJson = req.body;

        // Check signature if needed (skip for sandbox simplicity first)
        const statusResponse = await snap.transaction.notification(notificationJson);
        const orderId = statusResponse.order_id;
        const transactionStatus = statusResponse.transaction_status;
        const fraudStatus = statusResponse.fraud_status;

        console.log(`[MIDTRANS] Notification received for ${orderId}: ${transactionStatus}`);

        let dbStatus = 'PENDING';

        if (transactionStatus == 'capture') {
            if (fraudStatus == 'challenge') {
                dbStatus = 'CHALLENGE';
            } else if (fraudStatus == 'accept') {
                dbStatus = 'SUCCESS';
            }
        } else if (transactionStatus == 'settlement') {
            dbStatus = 'SUCCESS';
        } else if (transactionStatus == 'cancel' || transactionStatus == 'deny' || transactionStatus == 'expire') {
            dbStatus = 'FAILED';
        } else if (transactionStatus == 'pending') {
            dbStatus = 'PENDING';
        }

        // Update DB
        const transaction = await prisma.transaction.findUnique({ where: { id: orderId } });

        if (transaction && transaction.status !== 'SUCCESS' && dbStatus === 'SUCCESS') {
            // SUCCESS PAYMENT -> ADD TOKENS
            await prisma.$transaction([
                prisma.transaction.update({
                    where: { id: orderId },
                    data: { status: 'SUCCESS' }
                }),
                prisma.user.update({
                    where: { id: transaction.userId },
                    data: { tokenBalance: { increment: transaction.tokens } }
                })
            ]);
            console.log(`[MIDTRANS] Success! Added ${transaction.tokens} tokens to user ${transaction.userId}`);
        } else {
            // Just update status
            await prisma.transaction.update({
                where: { id: orderId },
                data: { status: dbStatus }
            });
        }

        res.status(200).send('OK');
    } catch (e) {
        console.error("Midtrans Notification Error:", e);
        res.status(500).send('Error');
    }
});

// API: Get current user info (for real-time balance updates)
app.get('/api/me', ensureAuthenticated, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                name: true,
                email: true,
                tokenBalance: true
            }
        });
        res.json(user);
    } catch (error) {
        console.error('API /api/me Error:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// API: Check transaction status (for payment polling)
// Also syncs with Midtrans if status is still PENDING (for localhost where webhooks don't work)
app.get('/api/transaction/check/:orderId', ensureAuthenticated, async (req, res) => {
    try {
        const { orderId } = req.params;

        let transaction = await prisma.transaction.findUnique({
            where: { id: orderId }
        });

        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        // Verify ownership
        if (transaction.userId !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // If still PENDING, try to sync with Midtrans directly
        if (transaction.status === 'PENDING') {
            try {
                const statusResponse = await snap.transaction.status(orderId);
                const transactionStatus = statusResponse.transaction_status;
                const fraudStatus = statusResponse.fraud_status;

                console.log(`[MIDTRANS SYNC] Order ${orderId}: ${transactionStatus}`);

                let dbStatus = 'PENDING';
                if (transactionStatus === 'capture') {
                    dbStatus = fraudStatus === 'accept' ? 'SUCCESS' : 'CHALLENGE';
                } else if (transactionStatus === 'settlement') {
                    dbStatus = 'SUCCESS';
                } else if (['cancel', 'deny', 'expire'].includes(transactionStatus)) {
                    dbStatus = 'FAILED';
                }

                // Update if status changed
                if (dbStatus !== 'PENDING') {
                    if (dbStatus === 'SUCCESS' && transaction.status !== 'SUCCESS') {
                        // Add tokens to user
                        await prisma.$transaction([
                            prisma.transaction.update({
                                where: { id: orderId },
                                data: { status: 'SUCCESS' }
                            }),
                            prisma.user.update({
                                where: { id: transaction.userId },
                                data: { tokenBalance: { increment: transaction.tokens } }
                            })
                        ]);
                        console.log(`[MIDTRANS SYNC] Success! Added ${transaction.tokens} tokens to user ${transaction.userId}`);
                        transaction.status = 'SUCCESS';
                    } else {
                        await prisma.transaction.update({
                            where: { id: orderId },
                            data: { status: dbStatus }
                        });
                        transaction.status = dbStatus;
                    }
                }
            } catch (midtransError) {
                // Midtrans API call failed - just return current DB status
                console.error('Midtrans status check error:', midtransError.message);
            }
        }

        res.json({
            status: transaction.status,
            tokens: transaction.tokens,
            orderId: transaction.id
        });
    } catch (error) {
        console.error('API Transaction Check Error:', error);
        res.status(500).json({ error: 'Failed to check transaction' });
    }
});


app.post('/save-probabilities', ensureAuthenticated, express.json({ limit: '50mb' }), express.urlencoded({ extended: true, limit: '50mb' }), async (req, res) => {
    try {
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

        // --- DB PERSISTENCE START ---
        // 1. Find or Create Form
        let form = await prisma.form.findUnique({ where: { url: baseUrl } });
        if (!form) {
            form = await prisma.form.create({
                data: {
                    userId: req.user.id,
                    url: baseUrl,
                    title: formData.formTitle || 'Untitled Form', // Note: Need to verify if formTitle is passed
                    structure: JSON.stringify(stats) // Saving basic structure snapshot
                }
            });
        }

        // 2. Create Configuration
        const config = await prisma.configuration.create({
            data: {
                formId: form.id,
                name: `Config - ${new Date().toLocaleString()}`,
                settings: JSON.stringify(formData)
            }
        });
        // --- DB PERSISTENCE END ---

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
                if (!stats[nameFakerEntry.name]) stats[nameFakerEntry.name] = {};
                stats[nameFakerEntry.name][fakerName] = (stats[nameFakerEntry.name][fakerName] || 0) + 1;
            }
            if (formData["gender-faker"]) {
                urlParams.append(genderFakerEntry.name, fakerGender);
                if (!stats[genderFakerEntry.name]) stats[genderFakerEntry.name] = {};
                stats[genderFakerEntry.name][fakerGender] = (stats[genderFakerEntry.name][fakerGender] || 0) + 1;
            }
            if (formData["city-faker"]) {
                urlParams.append(cityFakerEntry.name, fakerCity);
                if (!stats[cityFakerEntry.name]) stats[cityFakerEntry.name] = {};
                stats[cityFakerEntry.name][fakerCity] = (stats[cityFakerEntry.name][fakerCity] || 0) + 1;
            }
            if (formData["email-faker"]) {
                urlParams.append(emailFakerEntry.name, fakerEmail);
                if (!stats[emailFakerEntry.name]) stats[emailFakerEntry.name] = {};
                stats[emailFakerEntry.name][fakerEmail] = (stats[emailFakerEntry.name][fakerEmail] || 0) + 1;
            }
            const newForm = `${formUrl}&${urlParams.toString()}`;
            urlsToSend.push(newForm);
        }

        res.json({ urlsToSend, stats, configId: config.id });
    } catch (error) {
        console.error("Error in /save-probabilities:", error);
        res.status(500).json({ error: "Failed to process request" });
    }
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

app.post('/execute-links', ensureAuthenticated, express.json({ limit: '50mb' }), express.urlencoded({ extended: true, limit: '50mb' }), async (req, res) => {
    if (globalJob.isRunning) {
        return res.status(409).json({ error: 'A job is already running' });
    }

    // 1. Get Params
    let urlsVal = req.body.urls || req.body['urls[]'];
    if (!urlsVal) return res.status(400).json({ error: 'No URLs provided' });

    // Ensure array
    const urlsToSend = Array.isArray(urlsVal) ? urlsVal : [urlsVal];
    const configId = req.body.configId;

    // Config
    const concurrency = parseInt(req.body.concurrency) || 5;
    const delay = parseInt(req.body.delay) || 1000;
    const manualPageCount = parseInt(req.body.manualPageCount) || 0;
    const pageHistoryStr = req.body.pageHistoryStr || null;

    // --- TOKEN CHECK START ---
    const cost = urlsToSend.length;

    // Refresh user data to get latest balance
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    if (!user || user.tokenBalance < cost) {
        return res.status(402).json({ error: `Saldo tidak cukup! Butuh ${cost} tokens, Anda punya ${user ? user.tokenBalance : 0} tokens.` });
    }

    // Deduct Tokens & Log Transaction
    let updatedUser;
    try {
        const results = await prisma.$transaction([
            prisma.user.update({
                where: { id: user.id },
                data: { tokenBalance: { decrement: cost } }
            }),
            prisma.transaction.create({
                data: {
                    id: `USAGE-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    userId: user.id,
                    package: 'USAGE',
                    amount: 0,
                    tokens: -cost, // Negative to represent usage
                    status: 'SUCCESS'
                }
            })
        ]);
        updatedUser = results[0];
    } catch (err) {
        console.error("Token Deduction Failed:", err);
        return res.status(500).json({ error: "Gagal memproses token. Job dibatalkan." });
    }
    // --- TOKEN CHECK END ---

    // 2. Create Job in DB
    let job;
    if (configId) {
        try {
            job = await prisma.job.create({
                data: {
                    configId: configId,
                    targetCount: urlsToSend.length,
                    status: 'PENDING'
                }
            });
        } catch (e) {
            console.error("Failed to create Job in DB:", e);
            // Fallback? If DB fails, maybe we shouldn't run.
            return res.status(500).json({ error: 'Database Error: Could not create Job' });
        }
    } else {
        // Handle case where no configId is present (legacy or direct API call without config? We should probably enforce it or create a trash config)
        // For now, let's error if strictly needed, or just warn. 
        // Schema requires configId. So we MUST have one.
        // If missing, we can create a "Quick Run" config attached to a "Default Form"? 
        // Or just fail. Let's fail for now to ensure integrity.
        return res.status(400).json({ error: 'Missing Configuration ID. Please save probabilities first.' });
    }

    // 3. Init Global Job (Memory) for legacy/fast status checking
    globalJob = {
        isRunning: true,
        id: job.id, // Link to DB Job
        total: urlsToSend.length,
        current: 0,
        success: 0,
        fail: 0,
        logs: [],
        startTime: Date.now()
    };

    // 4. Start Background Worker (Fire and Forget)
    runBackgroundJob(urlsToSend, concurrency, delay, manualPageCount, pageHistoryStr, job.id);

    // 5. Return immediately
    res.json({ message: 'Job started', total: urlsToSend.length, jobId: job.id, newBalance: updatedUser.tokenBalance });
});

app.get('/job-status', ensureAuthenticated, (req, res) => {
    res.json(globalJob);
});

app.post('/stop-job', ensureAuthenticated, (req, res) => {
    if (!globalJob.isRunning) return res.json({ message: 'No job running' });
    globalJob.isRunning = false;
    res.json({ message: 'Stop signal sent' });
});

async function runBackgroundJob(urls, concurrency, delay, manualPageCount = 0, pageHistoryStr = null, jobId = null) {
    console.log(`[JOB] Starting background job: ${urls.length} items. Threads: ${concurrency}. Manual Pages: ${manualPageCount}. Page History: ${pageHistoryStr}`);

    if (jobId) {
        await prisma.job.update({
            where: { id: jobId },
            data: { status: 'RUNNING' }
        });
    }

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
                // Select Random User-Agent
                const randomUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

                const status = await new Promise((resolve) => {
                    const options = {
                        headers: {
                            'User-Agent': randomUA
                        }
                    };

                    const req = https.get(finalUrl, options, (response) => {
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
                        globalJob.success++;
                    } else {
                        globalJob.fail++;
                        // Log failure to DB
                        if (jobId) {
                            await prisma.jobLog.create({
                                data: {
                                    jobId: jobId,
                                    status: 'FAIL',
                                    message: `Status: ${status} | URL: ${finalUrl}`
                                }
                            });
                        }
                    }
                }
            } catch (err) {
                globalJob.fail++;
                if (jobId) {
                    await prisma.jobLog.create({
                        data: {
                            jobId: jobId,
                            status: 'FAIL',
                            message: `Exception: ${err.message} | URL: ${finalUrl}`
                        }
                    });
                }
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

    if (jobId) {
        await prisma.job.update({
            where: { id: jobId },
            data: {
                status: 'COMPLETED',
                successCount: globalJob.success,
                failCount: globalJob.fail,
                completedAt: new Date()
            }
        });
    }
}

// --- ADMIN ROUTES ---

// Admin Dashboard Page
app.get('/admin', ensureAdmin, async (req, res) => {
    try {
        // Get summary stats
        const totalUsers = await prisma.user.count();

        // Token stats from transactions (exclude admin operations)
        const purchaseAgg = await prisma.transaction.aggregate({
            where: {
                status: 'SUCCESS',
                tokens: { gt: 0 },
                NOT: { package: { startsWith: 'ADMIN-' } }
            },
            _sum: { tokens: true }
        });
        const totalTokensPurchased = purchaseAgg._sum.tokens || 0;

        const usageAgg = await prisma.transaction.aggregate({
            where: {
                status: 'SUCCESS',
                tokens: { lt: 0 },
                NOT: { package: { startsWith: 'ADMIN-' } }
            },
            _sum: { tokens: true }
        });
        const totalTokensUsed = Math.abs(usageAgg._sum.tokens || 0);

        // Total forms filled (jobs completed)
        const totalFormsFilled = await prisma.job.aggregate({
            _sum: { successCount: true }
        });

        // Active vouchers count
        const activeVouchers = await prisma.voucher.count({
            where: { active: true }
        });

        res.render('admin', {
            stats: {
                totalUsers,
                totalTokensPurchased,
                totalTokensUsed,
                totalFormsFilled: totalFormsFilled._sum.successCount || 0,
                activeVouchers
            }
        });
    } catch (error) {
        console.error('Admin Dashboard Error:', error);
        res.status(500).send('Error loading admin dashboard');
    }
});

// API: Get all users with stats
app.get('/api/admin/users', ensureAdmin, async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            include: {
                transactions: {
                    where: { status: 'SUCCESS' }
                },
                forms: {
                    include: {
                        configs: {
                            include: {
                                jobs: true
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const usersWithStats = users.map(user => {
            const tokensPurchased = user.transactions
                .filter(t => t.tokens > 0 && !t.package.startsWith('ADMIN-'))
                .reduce((sum, t) => sum + t.tokens, 0);
            const tokensUsed = Math.abs(user.transactions
                .filter(t => t.tokens < 0 && !t.package.startsWith('ADMIN-'))
                .reduce((sum, t) => sum + t.tokens, 0));

            let responsesSubmitted = 0;
            user.forms.forEach(form => {
                form.configs.forEach(config => {
                    config.jobs.forEach(job => {
                        responsesSubmitted += job.successCount;
                    });
                });
            });

            // Get form URLs for display
            const forms = user.forms.map(form => ({
                id: form.id,
                title: form.title || 'Untitled Form',
                url: form.url
            }));

            return {
                id: user.id,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                tokenBalance: user.tokenBalance,
                tokensPurchased,
                tokensUsed,
                responsesSubmitted,
                forms,
                createdAt: user.createdAt
            };
        });

        res.json(usersWithStats);
    } catch (error) {
        console.error('API Admin Users Error:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// API: Get all vouchers
app.get('/api/admin/vouchers', ensureAdmin, async (req, res) => {
    try {
        const vouchers = await prisma.voucher.findMany({
            include: {
                _count: {
                    select: { transactions: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(vouchers);
    } catch (error) {
        console.error('API Admin Vouchers Error:', error);
        res.status(500).json({ error: 'Failed to fetch vouchers' });
    }
});

// API: Create voucher
app.post('/api/admin/vouchers', ensureAdmin, async (req, res) => {
    try {
        const { code, percent, description } = req.body;

        if (!code || !percent) {
            return res.status(400).json({ error: 'Code and percent are required' });
        }

        const voucher = await prisma.voucher.create({
            data: {
                code: code.toUpperCase(),
                percent: parseInt(percent),
                description: description || null,
                active: true
            }
        });

        res.json(voucher);
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Voucher code already exists' });
        }
        console.error('API Create Voucher Error:', error);
        res.status(500).json({ error: 'Failed to create voucher' });
    }
});

// API: Toggle voucher active status
app.put('/api/admin/vouchers/:id', ensureAdmin, async (req, res) => {
    try {
        const voucher = await prisma.voucher.findUnique({
            where: { id: req.params.id }
        });

        if (!voucher) {
            return res.status(404).json({ error: 'Voucher not found' });
        }

        const updated = await prisma.voucher.update({
            where: { id: req.params.id },
            data: { active: !voucher.active }
        });

        res.json(updated);
    } catch (error) {
        console.error('API Toggle Voucher Error:', error);
        res.status(500).json({ error: 'Failed to update voucher' });
    }
});

// API: Delete voucher
app.delete('/api/admin/vouchers/:id', ensureAdmin, async (req, res) => {
    try {
        await prisma.voucher.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('API Delete Voucher Error:', error);
        res.status(500).json({ error: 'Failed to delete voucher' });
    }
});

// API: Get all transactions
app.get('/api/admin/transactions', ensureAdmin, async (req, res) => {
    try {
        const transactions = await prisma.transaction.findMany({
            include: {
                user: {
                    select: { name: true, email: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 100
        });
        res.json(transactions);
    } catch (error) {
        console.error('API Admin Transactions Error:', error);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

// Save admin log to database
async function addAdminLog(action, details, adminEmail, reason = '', targetUser = '') {
    try {
        await prisma.adminLog.create({
            data: {
                action,
                details,
                reason: reason || null,
                targetUser: targetUser || null,
                action: action,
                details: details,
                adminEmail: adminEmail
            }
        });
    } catch (err) {
        console.error('Failed to save admin log:', err);
    }
}

// API: Get Admin Logs (DB-backed)
app.get('/api/admin/logs', ensureAdmin, async (req, res) => {
    try {
        const logs = await prisma.adminLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 100
        });
        res.json(logs);
    } catch (err) {
        console.error('Failed to fetch admin logs:', err);
        res.status(500).json([]);
    }
});

// --- PACKAGE MANAGEMENT APIs ---

// Get all packages
app.get('/api/admin/packages', ensureAdmin, async (req, res) => {
    try {
        const packages = await prisma.tokenPackage.findMany({
            orderBy: { tokens: 'asc' }
        });
        res.json(packages);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch packages' });
    }
});

// Create package
app.post('/api/admin/packages', ensureAdmin, async (req, res) => {
    try {
        const { name, tokens, price, description, popular } = req.body;
        const newPackage = await prisma.tokenPackage.create({
            data: {
                name,
                tokens: parseInt(tokens),
                price: parseInt(price),
                description,
                popular: popular === true || popular === 'true'
            }
        });

        // Log action
        addAdminLog('CREATE_PACKAGE', `Created package ${name} (${tokens} tokens for Rp${price})`, req.user.email);

        res.json(newPackage);
    } catch (err) {
        res.status(500).json({ error: 'Failed to create package' });
    }
});

// Update package
app.put('/api/admin/packages/:id', ensureAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, tokens, price, description, popular, active } = req.body;

        const updated = await prisma.tokenPackage.update({
            where: { id },
            data: {
                name,
                tokens: parseInt(tokens),
                price: parseInt(price),
                description,
                popular: popular === true || popular === 'true',
                active: active === true || active === 'true'
            }
        });

        // Log action
        addAdminLog('UPDATE_PACKAGE', `Updated package ${name}`, req.user.email);

        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update package' });
    }
});

// Delete package
app.delete('/api/admin/packages/:id', ensureAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const pkg = await prisma.tokenPackage.delete({
            where: { id }
        });

        // Log action
        addAdminLog('DELETE_PACKAGE', `Deleted package ${pkg.name}`, req.user.email);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete package' });
    }
});

// API: Add tokens to user (admin only)
app.post('/api/admin/users/:id/tokens', ensureAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { tokens, reason } = req.body;
        const tokenCount = parseInt(tokens);

        if (isNaN(tokenCount) || tokenCount === 0) {
            return res.status(400).json({ error: 'Invalid token count' });
        }

        const user = await prisma.user.findUnique({
            where: { id }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update user balance
        const updatedUser = await prisma.user.update({
            where: { id },
            data: { tokenBalance: { increment: tokenCount } }
        });

        // Create transaction record
        await prisma.transaction.create({
            data: {
                id: `ADMIN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                userId: id,
                package: `ADMIN-${tokenCount > 0 ? 'ADD' : 'DELETE'}`,
                amount: 0,
                tokens: tokenCount,
                status: 'SUCCESS'
            }
        });

        // Log admin action to database
        await addAdminLog(
            tokenCount > 0 ? 'ADD_TOKENS' : 'DELETE_TOKENS',
            `${Math.abs(tokenCount)} tokens ${tokenCount > 0 ? 'added to' : 'deleted from'} ${user.email}`,
            req.user.email,
            reason || '-',
            user.email
        );

        res.json({
            success: true,
            newBalance: updatedUser.tokenBalance,
            message: `${Math.abs(tokenCount)} tokens ${tokenCount > 0 ? 'added' : 'deleted'} successfully`
        });
    } catch (error) {
        console.error('API Add Tokens Error:', error);
        res.status(500).json({ error: 'Failed to update tokens' });
    }
});

// API: Get admin logs from database
app.get('/api/admin/logs', ensureAdmin, async (req, res) => {
    try {
        const logs = await prisma.adminLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 100
        });
        res.json(logs);
    } catch (error) {
        console.error('API Admin Logs Error:', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

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
        // OPTIMIZATION: Block assets
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // OPTIMIZATION: Wait for DOM only, not full network idle
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

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