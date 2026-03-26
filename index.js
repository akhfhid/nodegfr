const express = require('express');
const http = require('http');
const https = require('https');
const puppeteer = require('puppeteer');
const { Faker, id_ID } = require('@faker-js/faker');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { randomUUID } = require('crypto');

const app = express();
app.set('server.allowedHosts', ['autofill.site', 'www.autofill.site', 'localhost']);
app.set('trust proxy', 1); // Trust first proxy (Cloudflare)
const PORT = process.env.PORT || 9997;
const HTTP_REQUEST_TIMEOUT_MS = parseInt(process.env.HTTP_REQUEST_TIMEOUT_MS || '20000', 10);
const JOB_PROGRESS_LOG_EVERY = parseInt(process.env.JOB_PROGRESS_LOG_EVERY || '25', 10);
const ENABLE_VERBOSE_JOB_LOGS = process.env.ENABLE_VERBOSE_JOB_LOGS === 'true';
const ENABLE_VERBOSE_SCRAPER_LOGS = process.env.ENABLE_VERBOSE_SCRAPER_LOGS === 'true';
const ENABLE_PAGE_CONSOLE_LOGS = process.env.ENABLE_PAGE_CONSOLE_LOGS === 'true';

const HTTPS_KEEPALIVE_AGENT = new https.Agent({
    keepAlive: true,
    maxSockets: 100,
    keepAliveMsecs: 1000,
    timeout: HTTP_REQUEST_TIMEOUT_MS
});
let browserInstance = null;

function safeLog(...args) {
    if (ENABLE_VERBOSE_JOB_LOGS) console.log(...args);
}

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

function createUniqueId(prefix) {
    // Keep IDs compact and collision-resistant even under concurrent multi-user load.
    return `${prefix}-${Date.now()}-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

app.get('/scrape', ensureAuthenticated, async (req, res) => {
    const inputUrl = (req.query.url || '').trim();
    if (!inputUrl) {
        return res.render('index', {
            url: '',
            questions: [],
            pageCount: 0
        });
    }

    let normalizedUrl = inputUrl;
    try {
        normalizedUrl = await normalizeFormUrl(inputUrl);
    } catch (err) {
        console.error(`[SCRAPE] Failed to normalize URL ${inputUrl}: ${err.message}`);
    }

    // Check if form exists in DB first
    // TODO: optimization later. for now just scrape.

    const formData = await scrape(normalizedUrl);
    const canonicalUrl = formData?.resolvedUrl || normalizedUrl;

    if (!formData || !formData.questions) {
        return res.render('index', {
            url: canonicalUrl,
            questions: [],
            pageCount: 0
        });
    }

    res.render('index', {
        url: canonicalUrl,
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

// --- MIDTRANS & PAYMENT ROUTES ---
const { snap } = require('./midtrans');

app.post('/api/purchase', ensureAuthenticated, async (req, res) => {
    const { tokens, voucherCode } = req.body;
    const tokenCount = parseInt(tokens);

    // 1. Validate Token Count (Min 1)
    if (isNaN(tokenCount) || tokenCount < 1) {
        return res.status(400).json({ error: "Minimal pembelian adalah 1 responden." });
    }

    let rate = 500;
    if (tokenCount >= 300) {
        rate = 350;
    } else if (tokenCount >= 100) {
        rate = 400;
    }

    const originalPrice = tokenCount * rate;
    let finalAmount = originalPrice;
    let discountAmount = 0;
    let validatedVoucher = null;

    if (voucherCode) {
        try {
            const voucher = await prisma.voucher.findUnique({
                where: { code: voucherCode.toUpperCase(), active: true }
            });

            if (voucher) {
                // Check if user has already USED this voucher successfully
                const usedVoucher = await prisma.transaction.findFirst({
                    where: {
                        userId: req.user.id,
                        voucherCode: voucher.code,
                        status: 'SUCCESS'
                    }
                });

                if (usedVoucher) {
                    // Do not apply discount if already used
                    console.log(`User ${req.user.id} already used voucher ${voucher.code}`);
                } else {
                    discountAmount = Math.floor((originalPrice * voucher.percent) / 100);
                    finalAmount = originalPrice - discountAmount;
                    validatedVoucher = voucher.code;
                }
            }
        } catch (voucherError) {
            console.error("Voucher validation error:", voucherError);
        }
    }

    const packageId = `CUSTOM-${tokenCount}`;
    const orderId = createUniqueId('ORDER');

    try {
        await prisma.transaction.create({
            data: {
                id: orderId,
                userId: req.user.id,
                package: packageId,
                amount: finalAmount,
                tokens: tokenCount,
                originalPrice: originalPrice,
                discountAmount: discountAmount,
                voucherCode: validatedVoucher,
                status: 'PENDING'
            }
        });

        let parameter = {
            "transaction_details": {
                "order_id": orderId,
                "gross_amount": finalAmount
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

app.post('/api/voucher/check', ensureAuthenticated, async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ valid: false, message: "Kode voucher kosong" });

    try {
        const voucher = await prisma.voucher.findUnique({
            where: { code: code.toUpperCase(), active: true }
        });

        if (voucher) {
            // Check if user has already USED this voucher successfully
            const usedVoucher = await prisma.transaction.findFirst({
                where: {
                    userId: req.user.id,
                    voucherCode: voucher.code,
                    status: 'SUCCESS'
                }
            });

            if (usedVoucher) {
                res.json({ valid: false, message: "Kamu sudah pernah menggunakan voucher ini" });
            } else {
                res.json({
                    valid: true,
                    code: voucher.code,
                    percent: voucher.percent,
                    description: voucher.description
                });
            }
        } else {
            res.json({ valid: false, message: "Voucher tidak ditemukan atau sudah tidak aktif" });
        }
    } catch (error) {
        console.error("Voucher API error:", error);
        res.status(500).json({ valid: false, message: "Terjadi kesalahan sistem" });
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
        baseUrl = await normalizeFormUrl(baseUrl);
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
            // Pass 'i' as iterationIndex for sequential logic
            const formUrl = decodeToGoogleFormUrl(baseUrl, newData, selections, i);

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

        const pageHistoryStr = req.body.pageHistoryStr || null;
        const fbzx = req.body.fbzx || null;
        const pageMapping = req.body.pageMapping || null;

        // Store URLs server-side (never expose to frontend)
        pendingUrls.set(config.id, {
            urls: urlsToSend,
            pageHistoryStr,
            fbzx,
            pageMapping,
            createdAt: Date.now()
        });

        // Auto-expire after 30 minutes
        setTimeout(() => pendingUrls.delete(config.id), 30 * 60 * 1000);

        // Return stats only, NOT the URLs
        res.json({ urlCount: urlsToSend.length, stats, configId: config.id, pageHistoryStr, fbzx, pageMapping });
    } catch (error) {
        console.error("Error in /save-probabilities:", error);
        res.status(500).json({ error: "Failed to process request" });
    }
});

// --- JOB MANAGEMENT ---
// Per-user job map: userId -> job state
const userJobs = new Map();

// Server-side URL cache: configId -> { urls, pageHistoryStr, fbzx, pageMapping, createdAt }
const pendingUrls = new Map();

function getUserJob(userId) {
    return userJobs.get(userId) || {
        isRunning: false,
        total: 0,
        current: 0,
        success: 0,
        fail: 0,
        logs: [],
        startTime: null
    };
}

async function refundFailedTokens(userId, tokenCount) {
    if (!userId || !tokenCount || tokenCount <= 0) return;

    await prisma.$transaction([
        prisma.user.update({
            where: { id: userId },
            data: { tokenBalance: { increment: tokenCount } }
        }),
        prisma.transaction.create({
            data: {
                id: createUniqueId('REFUND'),
                userId: userId,
                package: 'REFUND',
                amount: 0,
                tokens: tokenCount,
                status: 'SUCCESS'
            }
        })
    ]);
}

app.post('/execute-links', ensureAuthenticated, express.json({ limit: '50mb' }), express.urlencoded({ extended: true, limit: '50mb' }), async (req, res) => {
    const existingJob = getUserJob(req.user.id);
    if (existingJob.isRunning) {
        return res.status(409).json({ error: 'You already have a job running' });
    }

    // 1. Get URLs from server-side cache (NOT from frontend)
    const configId = req.body.configId;
    if (!configId) {
        return res.status(400).json({ error: 'Missing Configuration ID. Please save probabilities first.' });
    }

    const cached = pendingUrls.get(configId);
    if (!cached || !cached.urls || cached.urls.length === 0) {
        return res.status(400).json({ error: 'No URLs found for this configuration. Please regenerate.' });
    }

    const urlsToSend = cached.urls;

    // Config
    const requestedConcurrency = parseInt(req.body.concurrency) || 5;
    const concurrency = Math.min(Math.max(requestedConcurrency, 1), 30);
    const requestedDelay = parseInt(req.body.delay) || 1000;
    const delay = Math.min(Math.max(requestedDelay, 0), 60000);
    const manualPageCount = parseInt(req.body.manualPageCount) || 0;
    const pageHistoryStr = cached.pageHistoryStr || req.body.pageHistoryStr || null;
    const fbzx = cached.fbzx || req.body.fbzx || null;
    let pageMapping = null;
    try {
        pageMapping = cached.pageMapping ? (typeof cached.pageMapping === 'string' ? JSON.parse(cached.pageMapping) : cached.pageMapping) : null;
    } catch (e) {
        console.error('[EXECUTE] Failed to parse pageMapping:', e.message);
    }

    // Clean up cached URLs (one-time use)
    pendingUrls.delete(configId);


    // Deduct token + create usage transaction + create job in one DB transaction.
    // This guarantees: if one step fails, everything is rolled back automatically.
    const cost = urlsToSend.length;
    let updatedUser;
    let job;
    try {
        const txResult = await prisma.$transaction(async (tx) => {
            const freshUser = await tx.user.findUnique({
                where: { id: req.user.id },
                select: { id: true, tokenBalance: true }
            });

            if (!freshUser || freshUser.tokenBalance < cost) {
                const err = new Error('INSUFFICIENT_TOKENS');
                err.code = 'INSUFFICIENT_TOKENS';
                err.balance = freshUser ? freshUser.tokenBalance : 0;
                throw err;
            }

            const newUser = await tx.user.update({
                where: { id: freshUser.id },
                data: { tokenBalance: { decrement: cost } }
            });

            await tx.transaction.create({
                data: {
                    id: createUniqueId('USAGE'),
                    userId: freshUser.id,
                    package: 'USAGE',
                    amount: 0,
                    tokens: -cost, // Negative to represent usage
                    status: 'SUCCESS'
                }
            });

            const newJob = await tx.job.create({
                data: {
                    configId: configId,
                    targetCount: urlsToSend.length,
                    status: 'PENDING'
                }
            });

            return { newUser, newJob };
        });

        updatedUser = txResult.newUser;
        job = txResult.newJob;
    } catch (err) {
        if (err.code === 'INSUFFICIENT_TOKENS') {
            return res.status(402).json({ error: `Saldo tidak cukup! Butuh ${cost} tokens, Anda punya ${err.balance} tokens.` });
        }
        console.error("Failed to initialize job transaction:", err);
        return res.status(500).json({ error: "Gagal memproses job. Token tidak dipotong." });
    }

    // 3. Init Per-User Job (Memory)
    const userJob = {
        isRunning: true,
        id: job.id,
        userId: req.user.id,
        total: urlsToSend.length,
        current: 0,
        success: 0,
        fail: 0,
        logs: [],
        startTime: Date.now()
    };
    userJobs.set(req.user.id, userJob);

    // 4. Start Background Worker (Fire and Forget)
    runBackgroundJob(urlsToSend, concurrency, delay, manualPageCount, pageHistoryStr, job.id, req.user.id, fbzx, pageMapping)
        .catch((err) => {
            console.error('[JOB FATAL] Unhandled background error:', err);
        });

    // 5. Return immediately
    res.json({ message: 'Job started', total: urlsToSend.length, jobId: job.id, newBalance: updatedUser.tokenBalance });
});

app.get('/job-status', ensureAuthenticated, (req, res) => {
    res.json(getUserJob(req.user.id));
});

app.post('/stop-job', ensureAuthenticated, (req, res) => {
    const userJob = getUserJob(req.user.id);
    if (!userJob.isRunning) return res.json({ message: 'No job running' });
    userJob.isRunning = false;
    res.json({ message: 'Stop signal sent' });
});

async function runBackgroundJob(urls, concurrency, delay, manualPageCount = 0, pageHistoryStr = null, jobId = null, userId = null, fbzx = null, pageMapping = null) {
    console.log(`[JOB] Starting background job: ${urls.length} items. Threads: ${concurrency}. Manual Pages: ${manualPageCount}. Page History: ${pageHistoryStr} UserID: ${userId} Has PageMapping: ${!!pageMapping}`);

    // Get per-user job reference
    let userJob = userJobs.get(userId);
    if (!userJob) {
        userJob = {
            isRunning: true,
            id: jobId,
            userId: userId,
            total: urls.length,
            current: 0,
            success: 0,
            fail: 0,
            logs: [],
            startTime: Date.now()
        };
        userJobs.set(userId, userJob);
    }

    let finalJobStatus = 'COMPLETED';

    try {
        // Determine total page count from pageMapping or pageHistoryStr
        let totalPages = 1;
        if (pageMapping && Object.keys(pageMapping).length > 0) {
            totalPages = Math.max(...Object.values(pageMapping)) + 1;
        } else if (pageHistoryStr && pageHistoryStr !== '0') {
            totalPages = pageHistoryStr.split(',').length;
        } else if (manualPageCount > 0) {
            totalPages = manualPageCount + 1;
        }
        const isMultiPage = totalPages > 1;
        console.log(`[JOB] Total pages: ${totalPages}, Multi-page mode: ${isMultiPage}, pageMapping keys: ${pageMapping ? Object.keys(pageMapping).length : 0}`);

        if (jobId) {
            await prisma.job.update({
                where: { id: jobId },
                data: { status: 'RUNNING' }
            });
        }

        let currentIndex = 0;
        const activeWorkers = [];
        const statusFailureCounts = new Map();

        const logFailureStatus = (status, detail = '') => {
            const current = (statusFailureCounts.get(status) || 0) + 1;
            statusFailureCounts.set(status, current);
            if (current <= 3 || current % 25 === 0) {
                console.error(`[JOB FAIL] status=${status} count=${current}${detail ? ` | ${detail}` : ''}`);
            }
        };

    // Helper: Make a single HTTP POST request
    const makePostRequest = (hostname, path, formData, userAgent, { captureBody = false } = {}) => {
        return new Promise((resolve) => {
            const options = {
                hostname: hostname,
                path: path,
                method: 'POST',
                agent: HTTPS_KEEPALIVE_AGENT,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(formData),
                    'User-Agent': userAgent,
                    'Connection': 'keep-alive'
                }
            };

            const req = https.request(options, (res) => {
                let body = '';
                if (captureBody) {
                    res.on('data', (chunk) => body += chunk);
                } else {
                    res.resume();
                }
                res.on('end', () => {
                    resolve({ success: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body, location: res.headers.location });
                });
            });

            req.setTimeout(HTTP_REQUEST_TIMEOUT_MS, () => {
                req.destroy(new Error(`Request timeout after ${HTTP_REQUEST_TIMEOUT_MS}ms`));
            });

            req.on('error', (e) => {
                resolve({ success: false, status: 'ERROR', error: e.message });
            });

            req.write(formData);
            req.end();
        });
    };

    // Multi-page sequential submission for a single URL
    const submitMultiPage = async (targetUrl, userAgent) => {
        const url = new URL(targetUrl);
        const allParams = new URLSearchParams(url.search.substring(1));

        // Group entries by page
        const pageEntries = {}; // { pageIndex: [[key, value], ...] }
        const otherParams = []; // Non-entry params

        for (const [key, value] of allParams.entries()) {
            if (key.startsWith('entry.') || key.includes('other_option_response')) {
                // Determine which page this entry belongs to
                const baseEntryName = key.split('.').slice(0, 2).join('.').split('_')[0]; // e.g., "entry.1152921546"
                const entryPageIndex = pageMapping[baseEntryName] !== undefined ? pageMapping[baseEntryName] : 0;

                if (!pageEntries[entryPageIndex]) pageEntries[entryPageIndex] = [];
                pageEntries[entryPageIndex].push([key, value]);
            }
        }

        // Build cumulative partialResponse as we go through pages
        let cumulativeEntries = []; // [[null, entryId, ["value"], 0], ...]
        let lastResult = null;

        for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
            const isLastPage = (pageIdx === totalPages - 1);
            const pageParams = new URLSearchParams();

            // Add this page's entries
            const currentPageEntries = pageEntries[pageIdx] || [];
            currentPageEntries.forEach(([key, value]) => {
                pageParams.append(key, value);
                // Also add _sentinel fields for multi-choice entries
                if (key.startsWith('entry.') && !key.includes('_sentinel') && !key.includes('other_option_response')) {
                    pageParams.append(key + '_sentinel', '');
                }
            });

            // Add required params
            pageParams.append('fvv', '1');

            // Build partialResponse
            const partialResponse = JSON.stringify([cumulativeEntries.length > 0 ? cumulativeEntries : null, null, fbzx || '']);
            pageParams.append('partialResponse', partialResponse);

            // Build pageHistory (sequential: 0, then 0,1, then 0,1,2...)
            const pageHistoryArr = Array.from({ length: pageIdx + 1 }, (_, i) => i);
            pageParams.append('pageHistory', pageHistoryArr.join(','));

            // Add fbzx
            if (fbzx) {
                pageParams.append('fbzx', fbzx);
            }

            // Add submissionTimestamp and continue
            if (isLastPage) {
                pageParams.append('submissionTimestamp', Date.now().toString());
                // No 'continue' on last page
            } else {
                pageParams.append('submissionTimestamp', '-1');
                pageParams.append('continue', '1');
            }

            const formData = pageParams.toString();
            safeLog(`[MULTIPAGE] Page ${pageIdx}/${totalPages - 1}: ${currentPageEntries.length} entries, isLast=${isLastPage}, dataLen=${formData.length}`);
            safeLog(`[MULTIPAGE] POST to: ${url.hostname}${url.pathname}`);

            lastResult = await makePostRequest(url.hostname, url.pathname, formData, userAgent, { captureBody: true });

            if (!lastResult.success) {
                logFailureStatus(lastResult.status, `page=${pageIdx} ${lastResult.error ? `err=${lastResult.error}` : ''}`.trim());
                return lastResult;
            }

            // CRITICAL FIX 1: Update fbzx from response for the next request
            // Google Forms often returns a new fbzx in the intermediate page HTML
            const fbzxMatch = lastResult.body.match(/name="fbzx"\s+value="([^"]+)"/);
            if (fbzxMatch && fbzxMatch[1]) {
                const newFbzx = fbzxMatch[1];
                if (newFbzx !== fbzx) {
                    safeLog(`[MULTIPAGE] Updated fbzx: ${fbzx} -> ${newFbzx}`);
                    fbzx = newFbzx;
                }
            }

            // Add this page's entries to cumulative for next page's partialResponse
            // Add this page's entries to cumulative for next page's partialResponse
            currentPageEntries.forEach(([key, value]) => {
                // Modified filter: allow keys with 'other_option_response'
                if (key.startsWith('entry.') && !key.includes('_sentinel')) {

                    let entryId = null;
                    if (key.includes('other_option_response')) {
                        // Extract ID from entry.123.other_option_response
                        entryId = parseInt(key.replace('entry.', '').replace('.other_option_response', ''));
                    } else {
                        entryId = parseInt(key.replace('entry.', ''));
                    }

                    if (!isNaN(entryId)) {
                        // Check if this entry already exists in cumulative (update it)
                        const existingIdx = cumulativeEntries.findIndex(e => e && e[1] === entryId);
                        if (existingIdx >= 0) {
                            // Found existing entry.
                            if (key.includes('other_option_response')) {
                                // "Other" text value: Replace "__other_option__" sentinel if present
                                const valArr = cumulativeEntries[existingIdx][2];
                                const sentinelIdx = valArr.indexOf('__other_option__');
                                if (sentinelIdx >= 0) {
                                    valArr[sentinelIdx] = value; // Replace sentinel with actual text
                                } else {
                                    // Sentinel not found (unexpected order?), just push
                                    valArr.push(value);
                                }
                            } else {
                                // Normal value (or sentinel "__other_option__")
                                // Only push if we don't already have this value (avoid duplicates)
                                if (!cumulativeEntries[existingIdx][2].includes(value)) {
                                    cumulativeEntries[existingIdx][2].push(value);
                                }
                            }
                        } else {
                            cumulativeEntries.push([null, entryId, [value], 0]);
                        }
                    }
                }
            });

            // Small delay between page submissions
            if (!isLastPage) {
                await new Promise(r => setTimeout(r, 100));
            }
        }

        return lastResult;
    };

    // Single-page submission (original approach, simplified)
    const submitSinglePage = async (targetUrl, userAgent) => {
        const url = new URL(targetUrl);
        const allParams = new URLSearchParams(url.search.substring(1));
        const cleanParams = new URLSearchParams();

        // Add FVV=1
        cleanParams.append('fvv', '1');

        // Add entry params
        for (const [key, value] of allParams.entries()) {
            if (key.startsWith('entry.') || key.includes('other_option_response') || key === 'pageHistory') {
                cleanParams.append(key, value);
            }
        }

        const formData = cleanParams.toString();
        safeLog(`[SINGLEPAGE] POST to: ${url.hostname}${url.pathname}, entries: ${Array.from(cleanParams.keys()).filter(k => k.startsWith('entry.')).length}, dataLen=${formData.length}`);
        return makePostRequest(url.hostname, url.pathname, formData, userAgent);
    };

    const worker = async (workerId) => {
        while (currentIndex < urls.length && userJob.isRunning) {
            const index = currentIndex++;
            const u = urls[index];

            let finalUrl = u;

            try {
                // Select Random User-Agent
                const randomUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

                // RESOLVE REDIRECTS (Support forms.gle)
                if (finalUrl.includes('forms.gle')) {
                    try {
                        safeLog(`[JOB] Resolving forms.gle URL: ${finalUrl}`);
                        const shortUrl = new URL(finalUrl);
                        const originalParams = new URLSearchParams(shortUrl.search);

                        // Resolve only short link path, then re-attach generated form params.
                        const resolvedBase = await resolveRedirects(`${shortUrl.origin}${shortUrl.pathname}`);
                        const resolvedUrl = new URL(resolvedBase);
                        for (const [k, v] of originalParams.entries()) {
                            resolvedUrl.searchParams.append(k, v);
                        }
                        finalUrl = resolvedUrl.toString();
                        safeLog(`[JOB] Resolved to: ${finalUrl}`);
                    } catch (err) {
                        console.error(`[JOB ERROR] Failed to resolve forms.gle URL: ${err.message}`);
                    }
                }

                // FIX URL for submission (viewform -> formResponse)
                if (finalUrl.includes('/viewform')) {
                    finalUrl = finalUrl.replace('/viewform', '/formResponse');
                }

                let result;
                if (isMultiPage) {
                    // Multi-page: sequential per-page POST
                    result = await submitMultiPage(finalUrl, randomUA);
                } else {
                    // Single-page: one POST with all entries
                    result = await submitSinglePage(finalUrl, randomUA);
                }

                const { status, location } = result;

                if (status == 200 || status == 201) {
                    userJob.success++;
                } else {
                    // Check if it's a redirect (common in Google Forms)
                    if (status >= 300 && status < 400) {
                        // Still count as success for now, but log for investigation
                        userJob.success++;
                        safeLog(`[JOB WARNING] Redirect success status=${status} -> ${location || 'none'}`);
                    } else {
                        userJob.fail++;
                        logFailureStatus(status, `redirect=${location || 'none'}`);
                        // Log failure to DB
                        if (jobId) {
                            await prisma.jobLog.create({
                                data: {
                                    jobId: jobId,
                                    status: 'FAIL',
                                    message: `Status: ${status} | Redirect: ${location} | URL: ${finalUrl}`
                                }
                            });
                        }
                    }
                }
            } catch (err) {
                userJob.fail++;
                logFailureStatus('EXCEPTION', err.message);
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

            userJob.current++;
            if (userJob.current === userJob.total || userJob.current % JOB_PROGRESS_LOG_EVERY === 0) {
                console.log(`[JOB PROGRESS] ${userJob.current}/${userJob.total} | success=${userJob.success} fail=${userJob.fail}`);
            }

            if (delay > 0) await new Promise(r => setTimeout(r, delay));
        }
    };

        const numWorkers = Math.min(concurrency, urls.length);
        for (let i = 0; i < numWorkers; i++) {
            activeWorkers.push(worker(i + 1));
        }

        await Promise.all(activeWorkers);
        console.log(`[JOB] Finished. Success: ${userJob.success}, Fail: ${userJob.fail}`);
    } catch (err) {
        finalJobStatus = 'FAILED';
        console.error(`[JOB FATAL] Background worker crashed:`, err);
    } finally {
        // If stopped/crashed before all items are processed, mark the rest as failed
        // so deducted tokens are fully returned.
        if (userJob.current < userJob.total) {
            const unprocessed = userJob.total - userJob.current;
            userJob.fail += unprocessed;
            userJob.current = userJob.total;
            console.log(`[JOB] Marked ${unprocessed} unprocessed items as failed for refund.`);
        }

        userJob.isRunning = false;

        const allFailed = userJob.success === 0 && userJob.fail > 0;
        const finalPersistedStatus = (finalJobStatus === 'FAILED' || allFailed) ? 'FAILED' : 'COMPLETED';

        if (jobId) {
            try {
                await prisma.job.update({
                    where: { id: jobId },
                    data: {
                        status: finalPersistedStatus,
                        successCount: userJob.success,
                        failCount: userJob.fail,
                        completedAt: new Date()
                    }
                });
            } catch (err) {
                console.error(`[JOB DB ERROR] Failed to update final job status:`, err);
            }
        }

        if (userJob.fail > 0 && userId) {
            console.log(`[JOB REFUND] Detected ${userJob.fail} failures. Refunding ${userJob.fail} tokens to user ${userId}...`);
            try {
                await refundFailedTokens(userId, userJob.fail);
                console.log(`[JOB REFUND] Refund successful!`);
            } catch (err) {
                console.error(`[JOB REFUND ERROR] Failed to refund tokens:`, err);
            }
        }

        // Clean up finished job from map after a delay (keep it for 30s so frontend can see final status)
        setTimeout(() => {
            const job = userJobs.get(userId);
            if (job && !job.isRunning) {
                userJobs.delete(userId);
            }
        }, 30000);
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

// API: Get all users with stats (Paginated)
app.get('/api/admin/users', ensureAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const q = req.query.q || '';

        const where = q ? {
            OR: [
                { name: { contains: q } },
                { email: { contains: q } }
            ]
        } : {};

        const [users, totalCount] = await Promise.all([
            prisma.user.findMany({
                where,
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
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.user.count({ where })
        ]);

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

            return {
                id: user.id,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                tokenBalance: user.tokenBalance,
                tokensPurchased,
                tokensUsed,
                responsesSubmitted,
                forms: user.forms.map(form => ({ id: form.id, title: form.title, url: form.url })),
                createdAt: user.createdAt
            };
        });

        res.json({
            users: usersWithStats,
            pagination: {
                page,
                limit,
                totalCount,
                totalPages: Math.ceil(totalCount / limit)
            }
        });
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

// API: Get all transactions (Paginated)
app.get('/api/admin/transactions', ensureAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const q = req.query.q || '';

        const where = q ? {
            OR: [
                { id: { contains: q } },
                { package: { contains: q } },
                { status: { contains: q } },
                { user: { name: { contains: q } } },
                { user: { email: { contains: q } } }
            ]
        } : {};

        const [transactions, totalCount] = await Promise.all([
            prisma.transaction.findMany({
                where,
                include: {
                    user: {
                        select: { name: true, email: true }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.transaction.count({ where })
        ]);

        res.json({
            transactions,
            pagination: {
                page,
                limit,
                totalCount,
                totalPages: Math.ceil(totalCount / limit)
            }
        });
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
                adminEmail: adminEmail
            }
        });
    } catch (err) {
        console.error('Failed to save admin log:', err);
    }
}

// API: Get Admin Logs (DB-backed, Paginated)
app.get('/api/admin/logs', ensureAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const q = req.query.q || '';

        const where = q ? {
            OR: [
                { action: { contains: q } },
                { details: { contains: q } },
                { adminEmail: { contains: q } },
                { targetUser: { contains: q } },
                { reason: { contains: q } }
            ]
        } : {};

        const [logs, totalCount] = await Promise.all([
            prisma.adminLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.adminLog.count({ where })
        ]);

        res.json({
            logs,
            pagination: {
                page,
                limit,
                totalCount,
                totalPages: Math.ceil(totalCount / limit)
            }
        });
    } catch (err) {
        console.error('[ADMIN_API_LOGS] Error:', err);
        res.status(500).json({ error: 'Failed to fetch admin logs', details: err.message });
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
                id: createUniqueId('ADMIN'),
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

app.get('/api/admin/server-stats', ensureAdmin, async (req, res) => {
    try {
        const cpus = os.cpus();
        const loadAvg = os.loadavg();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const uptime = os.uptime();

        // Get application directory size (actual app usage)
        exec('du -sb .', (error, stdout, stderr) => {
            let appSizeBytes = 0;
            if (!error) {
                appSizeBytes = parseInt(stdout.split('\t')[0]);
            }

            // Fake 100GB Storage Logic
            const totalFakeGB = 100;
            const totalFakeBytes = totalFakeGB * 1024 * 1024 * 1024;
            const usedMB = (appSizeBytes / (1024 * 1024)).toFixed(2);
            const availGB = ((totalFakeBytes - appSizeBytes) / (1024 * 1024 * 1024)).toFixed(2);
            const usePercent = ((appSizeBytes / totalFakeBytes) * 100).toFixed(2);

            res.json({
                os: {
                    platform: os.platform(),
                    type: os.type(),
                    release: os.release(),
                    hostname: os.hostname(),
                    uptime: uptime,
                    arch: os.arch(),
                    nodeVersion: process.version,
                    serverTime: new Date().toLocaleTimeString('en-US', { hour12: false }),
                    interfaces: Object.keys(os.networkInterfaces()).filter(i => !i.startsWith('lo')).length || 1
                },
                cpu: {
                    model: cpus[0].model,
                    speed: "4.20", // Boosted/Fake Speed in GHz
                    cores: cpus.length,
                    load: loadAvg,
                    threads: cpus.length * 2 // Faked hyperthreading display
                },
                memory: {
                    total: totalMem,
                    free: freeMem,
                    used: totalMem - freeMem,
                    process: process.memoryUsage()
                },
                disk: {
                    size: '100 GB', // Fake 
                    used: (appSizeBytes / (1024 * 1024)).toFixed(2) + ' MB',
                    avail: ((100 * 1024 * 1024 * 1024 - appSizeBytes) / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
                    usePercent: ((appSizeBytes / (100 * 1024 * 1024 * 1024)) * 100).toFixed(2) + '%'
                }
            });
        });
    } catch (error) {
        console.error("Server Stats API error:", error);
        res.status(500).json({ error: "Failed to fetch server stats" });
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

const server = app.listen(PORT, () => {
    console.log(`Example app listening on port ${PORT}`);
});

let isShuttingDown = false;
async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[SHUTDOWN] Received ${signal}. Closing server...`);

    const forceExitTimer = setTimeout(() => {
        console.error('[SHUTDOWN] Force exit after timeout.');
        process.exit(1);
    }, 10000);
    forceExitTimer.unref();

    server.close(async () => {
        try {
            if (browserInstance && browserInstance.isConnected()) {
                await browserInstance.close();
            }
        } catch (err) {
            console.error(`[SHUTDOWN] Browser close error: ${err.message}`);
        }

        try {
            await prisma.$disconnect();
        } catch (err) {
            console.error(`[SHUTDOWN] Prisma disconnect error: ${err.message}`);
        }

        clearTimeout(forceExitTimer);
        process.exit(0);
    });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

function decodeToGoogleFormUrl(baseUrl, data, selections, iterationIndex = 0) {
    try {
        const parsedBase = new URL(baseUrl);
        parsedBase.hash = '';
        parsedBase.search = '';

        if (parsedBase.pathname.includes('/viewform')) {
            parsedBase.pathname = parsedBase.pathname.replace('/viewform', '/formResponse');
        } else if (!parsedBase.pathname.includes('/formResponse')) {
            parsedBase.pathname = parsedBase.pathname.replace(/\/$/, '') + '/formResponse';
        }
        baseUrl = parsedBase.toString();
    } catch (err) {
        baseUrl = String(baseUrl || '').replace(/viewform/, 'formResponse').split('?')[0];
    }

    const urlParams = new URLSearchParams();

    for (const entry of data) {
        if (entry.name == "url" || entry.name == "pageCount" || entry.name == "manualPageCount" || entry.name == "pageHistoryStr") {
            continue;
        }
        const name = entry.name;
        const isMultipleChoice = entry.checkbox;
        const hasOtherOption = entry.hasOtherOption;
        const items = entry.items;

        // SEQUENTIAL LOGIC:
        // Use iterationIndex to pick item cyclically
        // If items.length is 0, skip
        if (items.length === 0) continue;

        if (isMultipleChoice) {
            // For Checkboxes, use independent probability rolls for each option
            const selectedItems = selectIndependentOptions(items);

            if (selectedItems.length === 0) {
                // FALLBACK: If no options rolled true, pick one weighted random to ensure the field isn't empty if required
                // (Though usually for checkboxes, empty is allowed unless validated)
                const fallback = selectWeightedRandomItem(items);
                if (fallback && parseFloat(fallback.chance) > 0) {
                    selectedItems.push(fallback);
                }
            }

            selectedItems.forEach(item => {
                if (hasOtherOption && item.isOtherOption) {
                    urlParams.append(name, '__other_option__');
                    urlParams.append(name + '.other_option_response', item.option);
                } else {
                    urlParams.append(name, item.option);
                }
            });
            selections.push({ name, values: selectedItems.map(i => i.option) });

        } else {
            // For Single Choice (Radio, Dropdown, Linear Scale) or Short Answer variants
            // Use Weighted Random selection based on 'chance'
            selectedResult = selectWeightedRandomItem(items);

            if (selectedResult) {
                console.log(`[DECIDER] Weighted Selection [${iterationIndex}]: ${selectedResult.option} (Prob: ${selectedResult.chance}%)`);

                if (selectedResult.isOtherOption) {
                    urlParams.append(name, '__other_option__');
                    urlParams.append(name + '.other_option_response', selectedResult.option);
                } else {
                    urlParams.append(name, selectedResult.option);
                }
                selections.push({ name, values: [selectedResult.option] });
            }
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

    // Only append pageHistory for multi-page forms
    // Single-page forms (pageHistory="0") don't need this parameter
    if (pageHistory !== "0") {
        urlParams.append('pageHistory', pageHistory);
        console.log(`[URL BUILDER] Multi-page form detected - adding pageHistory: ${pageHistory}`);
    } else {
        console.log(`[URL BUILDER] Single-page form detected - skipping pageHistory parameter`);
    }

    // Add fbzx if present (CRITICAL for multi-page)
    const fbzx = data.find(e => e.name === 'fbzx')?.value;
    if (fbzx) {
        urlParams.append('fbzx', fbzx);
        urlParams.append('continue', '1');
    }

    console.log(`[URL BUILDER] Final Page Count: ${pages} -> pageHistory: ${pageHistory}`);
    console.log(`[URL BUILDER] Full Params: ${urlParams.toString()}`);

    return `${baseUrl}?${urlParams.toString()}`;
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
    if (!optionsWithWeights || optionsWithWeights.length === 0) return null;
    let totalWeight = 0;
    for (const item of optionsWithWeights) {
        totalWeight += parseFloat(item.chance);
    }
    if (totalWeight === 0) return optionsWithWeights[0];
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

async function getBrowser() {
    if (browserInstance && !browserInstance.isConnected()) {
        browserInstance = null;
    }

    if (!browserInstance) {
        browserInstance = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        browserInstance.on('disconnected', () => {
            browserInstance = null;
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
        const finalUrl = page.url();
        console.log(`[SCRAPER] Final URL after redirects: ${finalUrl}`);

        if (ENABLE_PAGE_CONSOLE_LOGS) {
            page.on('console', msg => {
                const text = msg.text();
                if (!text.includes('net::ERR_FAILED')) {
                    console.log('PAGE LOG:', text);
                }
            });
        }

        const pageTitle = await page.title();
        safeLog(`[SCRAPER] Page Title: ${pageTitle}`);

        if (pageTitle.toLowerCase().includes('sign in') || pageTitle.toLowerCase().includes('login')) {
            console.error('[SCRAPER] Login required or restricted form.');
            return { error: 'Login required', questions: [] };
        }
        const formTitle = await page.evaluate(() => {
            const heading = document.querySelector('div[role="heading"][aria-level="1"]') || document.querySelector('div[role="heading"]') || document.querySelector('.F9yp7e');
            return heading ? heading.innerText.trim() : document.title.replace(' - Google Forms', '');
        });

        const formData = await page.evaluate(() => {
            const getLoadData = () => {
                const scripts = document.querySelectorAll('script');
                for (const script of scripts) {
                    const text = script.textContent;
                    if (text.includes('FB_PUBLIC_LOAD_DATA_')) {
                        try {
                            // Method 1: Match the assignment (handles multiline with dotAll-like approach)
                            const match = text.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*([\s\S]*?)\s*;\s*$/m);
                            if (match && match[1]) {
                                return JSON.parse(match[1]);
                            }
                            // Method 2: Fallback - extract everything after the assignment operator
                            const idx = text.indexOf('FB_PUBLIC_LOAD_DATA_');
                            if (idx >= 0) {
                                const eqIdx = text.indexOf('=', idx);
                                if (eqIdx >= 0) {
                                    let jsonStr = text.substring(eqIdx + 1).trim();
                                    // Remove trailing semicolons
                                    if (jsonStr.endsWith(';')) jsonStr = jsonStr.slice(0, -1).trim();
                                    return JSON.parse(jsonStr);
                                }
                            }
                        } catch (e) {
                            console.error('[SCRAPER] JSON parse error for FB_PUBLIC_LOAD_DATA_:', e.message);
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
            let currentPageIndex = 0; // Track which page we're on (0-indexed)
            const pageHistory = [0];

            const fields = rawData[1][1];
            if (!fields) return { error: "No fields found in form data", questions: [] };

            fields.forEach((field) => {
                const label = field[1];
                const typeId = field[3];
                const inputData = field[4];

                if (ENABLE_VERBOSE_SCRAPER_LOGS) {
                    console.log(`[SCRAPER RAW] Type: ${typeId}, Label: ${label ? label.substring(0, 20) : 'N/A'}`);
                }

                if (!inputData && typeId !== 8) {
                    return;
                }

                // TYPE 8 = Section Header / Page Break logic first
                if (typeId === 8) {
                    if (ENABLE_VERBOSE_SCRAPER_LOGS) {
                        console.log(`[SCRAPER RAW] Type 8 Found!`);
                    }
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
                        hasOtherOptions: false,
                        pageIndex: currentPageIndex
                    });

                    pageCount++;
                    currentPageIndex++; // Move to next page after section break
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
                            hasOtherOptions: hasOtherOptions,
                            pageIndex: currentPageIndex
                        });
                    }
                }
            });

            // Extract FBZX from hidden input
            const fbzxInput = document.querySelector('input[name="fbzx"]');
            const fbzx = fbzxInput ? fbzxInput.value : null;

            return { questions, typeCounts, pageCount, pageHistoryStr: pageHistory.join(','), fbzx };
        });

        if (formData.error) {
            console.error(`[SCRAPER] Error extracting data: ${formData.error}`);
            return { error: formData.error, questions: [], pageCount: 0, pageHistoryStr: "0" };
        }

        const validData = formData.questions.filter(q => q);
        safeLog(`[SCRAPER] Found ${validData.length} valid questions.`);
        if (formData.fbzx) safeLog(`[SCRAPER] Found fbzx token: ${formData.fbzx}`);

        // Include formTitle in the return object
        return {
            questions: validData,
            pageCount: formData.pageCount,
            pageHistoryStr: formData.pageHistoryStr,
            title: formTitle,
            fbzx: formData.fbzx,
            resolvedUrl: finalUrl
        };
    } catch (err) {
        console.error(`[SCRAPER] Error: ${err.message}`);
        return { error: err.message, questions: [] };
    } finally {
        if (page && !page.isClosed()) {
            try {
                await page.close();
            } catch (closeErr) {
                safeLog(`[SCRAPER] Failed to close page cleanly: ${closeErr.message}`);
            }
        }
    }
}


async function normalizeFormUrl(inputUrl) {
    const rawUrl = String(inputUrl || '').trim();
    if (!rawUrl) return rawUrl;
    if (!rawUrl.includes('forms.gle')) return rawUrl;
    return resolveRedirects(rawUrl);
}

// Helper to follow redirects (for forms.gle)
async function resolveRedirects(url, maxRedirects = 10) {
    let currentUrl = url;
    for (let i = 0; i < maxRedirects; i++) {
        const nextLocation = await new Promise((resolve, reject) => {
            const urlObj = new URL(currentUrl);
            const client = urlObj.protocol === 'http:' ? http : https;
            const req = client.request(urlObj, {
                method: 'GET',
                headers: {
                    'User-Agent': USER_AGENTS[0]
                }
            }, (res) => {
                const status = res.statusCode || 0;
                const location = res.headers.location;
                res.resume();

                if (status >= 300 && status < 400 && location) {
                    try {
                        resolve(new URL(location, currentUrl).toString());
                    } catch (err) {
                        reject(err);
                    }
                    return;
                }
                resolve(null);
            });
            req.on('error', reject);
            req.end();
        });

        if (!nextLocation) return currentUrl;
        currentUrl = nextLocation;
    }

    throw new Error(`Too many redirects while resolving URL: ${url}`);
}
