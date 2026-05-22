import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { spawn } from 'child_process';
import axios from 'axios';
import { getAuthUrl, setTokens, listEmails, getEmailDetails, getUserProfile } from './services/gmailService.js';
import { getReadEmails, markEmailAsRead } from './services/readStatusService.js';
import { getCachedEmails, deleteUserCache, syncCacheStatus, overwriteCache } from './services/emailCacheService.js';
import { calculateInstantScore } from './services/fastScorerService.js';
import { getUserSettings, saveUserSettings, deleteUserSettings, defaultSettings } from './services/settingsService.js';

dotenv.config();

// Validate required environment variables
const requiredEnv = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'];
const missingEnv = requiredEnv.filter(env => !process.env[env]);
if (missingEnv.length > 0) {
    console.error(`ERROR: Missing required environment variables: ${missingEnv.join(', ')}`);
    console.error('Please configure these in your Railway/local environment before starting the server.');
    // In production, we might want to exit, but for now let's just log it clearly
    // process.exit(1); 
}

const app = express();
const PORT = process.env.PORT || 5000;
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://127.0.0.1:8000';
const SCORING_ALGORITHM_VERSION = 'deadline-time-v2';
const cacheRefreshesInProgress = new Set<string>();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// CODE_DIR is where the python venv and scripts live (part of the Docker image)
const CODE_DIR = path.resolve(__dirname, '../../data');

// STORAGE_DIR is where tokens, cache, and settings live (persisted via volume)
// In production/Railway, we should mount a volume to /app/storage and set STORAGE_PATH=/app/storage
const STORAGE_DIR = process.env.STORAGE_PATH || CODE_DIR;
const TOKENS_FILE = path.join(STORAGE_DIR, 'tokens.json');

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
    try {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
    } catch (err) {
        console.error('Failed to create STORAGE_DIR:', err);
    }
}

// CORS Configuration
const allowedOrigins = [
    process.env.FRONTEND_URL,
    'https://email-prioritization.vercel.app',
    'https://email-prioritization-production.up.railway.app',
].filter(Boolean) as string[];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
            callback(null, true);
        } else {
            console.warn(`[CORS] Rejected: ${origin}`);
            callback(null, true); // Fallback: allow for debugging
        }
    },
    credentials: true
}));

// Global Request Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

app.use(express.json({ limit: '10mb' }));

let userTokens: any = null;
let cachedUserEmail: string | null = null;

// Load tokens on startup
if (fs.existsSync(TOKENS_FILE)) {
    try {
        userTokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8'));
        console.log('✓ Tokens loaded from storage');
    } catch (err) {
        console.error('Failed to load tokens:', err);
    }
}

// ── Python Service Management ──
let isPythonReady = false;

async function waitForPythonService(retries = 30): Promise<boolean> {
    console.log('Checking Python Scoring Service health...');
    for (let i = 0; i < retries; i++) {
        try {
            await axios.get(`${PYTHON_SERVICE_URL}/health`);
            isPythonReady = true;
            console.log('✓ Python Scoring Service is ready');
            return true;
        } catch (err) {
            process.stdout.write('.');
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    console.error('\nPython Scoring Service failed to warm up after multiple retries.');
    return false;
}

function startPythonService() {
    console.log('Starting Python Scoring Service...');
    
    let pythonPath = process.env.PYTHON_PATH;
    if (!pythonPath) {
        const venvPath = process.platform === 'win32' 
            ? path.join(CODE_DIR, 'venv/Scripts/python.exe')
            : path.join(CODE_DIR, 'venv/bin/python');
        
        if (fs.existsSync(venvPath)) {
            pythonPath = venvPath;
        } else {
            pythonPath = process.platform === 'win32' ? 'python' : 'python3';
        }
    }
    
    const scriptPath = path.join(CODE_DIR, 'scoring_service.py');
    
    if (!fs.existsSync(scriptPath)) {
        console.error(`ERROR: Python script not found at ${scriptPath}`);
        return null;
    }

    console.log(`Spawning Python process: ${pythonPath} ${scriptPath}`);
    try {
        const service = spawn(pythonPath, [scriptPath], {
            env: { ...process.env, PYTHONPATH: CODE_DIR }
        });

        service.on('error', (err) => {
            console.error('Failed to start Python service:', err);
        });

        service.stdout.on('data', (data) => {
            const msg = data.toString().trim();
            console.log(`[Python Service] ${msg}`);
        });
        
        service.stderr.on('data', (data) => {
            const msg = data.toString().trim();
            if (msg.includes('DEBUG:') || msg.includes('INFO:') || msg.includes('Loading weights:') || msg.includes('%|')) {
                console.log(`[Python Service] ${msg}`);
            } else {
                console.error(`[Python Service Error] ${msg}`);
            }
        });
        
        service.on('close', (code) => {
            console.log(`Python Service exited with code ${code}.`);
            isPythonReady = false;
            if (code !== 0) {
                console.log('Restarting Python service in 5 seconds...');
                setTimeout(startPythonService, 5000);
            }
        });
        
        return service;
    } catch (err) {
        console.error('Critical error spawning Python process:', err);
        return null;
    }
}

// Helper: get the current user email, or null
async function getCurrentUserEmail(): Promise<string | null> {
    if (!userTokens) return null;
    if (cachedUserEmail) return cachedUserEmail;
    try {
        const profile = await getUserProfile(userTokens);
        cachedUserEmail = profile?.email || null;
        return cachedUserEmail;
    } catch {
        return null;
    }
}

// ── API Routes ──

// Root route
app.get('/', (req, res) => {
    res.send('Siftly AI Backend is running. Access the API at /api/*');
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        pythonService: isPythonReady ? 'ready' : 'warming_up',
        authStatus: userTokens ? 'authenticated' : 'not_authenticated'
    });
});

const api = express.Router();

// Middleware to check if AI service is ready for specific routes
// NOTE: /emails is intentionally excluded — the handler serves cached emails even while Python warms up.
// Only pure /prioritize routes require the Python service to be ready.
const ensurePythonReady = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!isPythonReady && req.path.includes('/prioritize')) {
        return res.status(503).json({ 
            error: 'AI Scoring Engine is still warming up (loading models). Please try again in 30-60 seconds.' 
        });
    }
    next();
};

api.use(ensurePythonReady);

api.get('/auth/url', (req, res) => {
    try {
        const url = getAuthUrl();
        res.json({ url });
    } catch (err: any) {
        console.error('Error generating auth URL:', err);
        res.status(500).json({ error: 'Failed to generate auth URL' });
    }
});

api.get('/auth/callback', async (req, res) => {
    const { code } = req.query;
    if (code) {
        try {
            userTokens = await setTokens(code as string);
            cachedUserEmail = null; // Reset cache for new user
            fs.writeFileSync(TOKENS_FILE, JSON.stringify(userTokens, null, 2));
            
            // Detect if we should redirect to local or production
            const isLocal = req.headers.host?.includes('localhost') || req.headers.host?.includes('127.0.0.1');
            const defaultUrl = isLocal ? 'http://localhost:3000' : 'https://siftly-email.vercel.app';
            const frontendUrl = process.env.FRONTEND_URL || defaultUrl;
            
            console.log(`[Auth] Success. Redirecting to: ${frontendUrl}/dashboard`);
            res.redirect(`${frontendUrl}/dashboard`);
        } catch (err) {
            console.error('Auth Callback Error:', err);
            res.status(500).send('Authentication failed');
        }
    } else {
        res.status(400).send('No code provided');
    }
});

api.post('/auth/logout', (req, res) => {
    userTokens = null;
    cachedUserEmail = null;
    if (fs.existsSync(TOKENS_FILE)) {
        try {
            fs.unlinkSync(TOKENS_FILE);
        } catch (err) {
            console.error('Failed to delete tokens file:', err);
        }
    }
    res.json({ success: true });
});

api.get('/emails', async (req, res) => {
    if (!userTokens) {
        console.warn('[API/Emails] Unauthorized - No tokens');
        return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
        console.log('[API/Emails] Fetching for user...');
        const userEmail = await getCurrentUserEmail();
        if (!userEmail) {
            console.warn('[API/Emails] Could not determine user email');
            return res.status(401).json({ error: 'Could not determine user email' });
        }

        console.log(`[API/Emails] Start sync for ${userEmail}`);
        const settings = getUserSettings(userEmail);
        console.time('FetchEmails');
        
        const cached = getCachedEmails(userEmail);
        const cachedIds = new Set(cached.map(e => e.id));

        console.log('[API/Emails] Calling Gmail API (listEmails)...');
        const messages = await listEmails(userTokens, undefined, 100);
        const currentIds = messages.map(m => m.id!);
        
        console.log('[API/Emails] Checking unread status...');
        const unreadMessages = await listEmails(userTokens, 'is:unread', 500).catch(() => []);
        const unreadIds = new Set(unreadMessages.map(m => m.id!));
        syncCacheStatus(userEmail, unreadIds, currentIds);
        
        const newMessages = messages.filter(m => !cachedIds.has(m.id!));
        console.log(`[API/Emails] Found ${newMessages.length} new messages out of ${messages.length} fetched.`);

        const scoreEmails = async (emailsToScore: any[]) => {
            const scored: any[] = [];
            const CHUNK_SIZE = 5;
            for (let i = 0; i < emailsToScore.length; i += CHUNK_SIZE) {
                const chunk = emailsToScore.slice(i, i + CHUNK_SIZE);
                console.log(`[API/Emails] Posting scoring chunk ${i / CHUNK_SIZE + 1} to Python service at ${PYTHON_SERVICE_URL}...`);
                const response = await axios.post(`${PYTHON_SERVICE_URL}/prioritize`, {
                    emails: chunk,
                    settings_path: path.join(STORAGE_DIR, `settings/${userEmail.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`),
                    user_email: userEmail,
                    reference_date: new Date().toISOString()
                }, { timeout: 60000 });
                scored.push(...chunk.map((email, index) => ({
                    ...email,
                    ...response.data[index],
                    scoring_version: SCORING_ALGORITHM_VERSION
                })));
                if (i + CHUNK_SIZE < emailsToScore.length) await new Promise(resolve => setTimeout(resolve, 300));
            }
            return scored;
        };

        let analyzedNew: any[] = [];
        if (newMessages.length > 0) {
            console.log(`[API/Emails] Scoring ${newMessages.length} new messages in chunks...`);
            const CHUNK_SIZE = 5;
            for (let i = 0; i < newMessages.length; i += CHUNK_SIZE) {
                const chunk = newMessages.slice(i, i + CHUNK_SIZE);
                console.log(`[API/Emails] Fetching details for chunk ${i / CHUNK_SIZE + 1}...`);
                const chunkPromises = chunk.map(m => getEmailDetails(userTokens, m.id!).catch(() => null));
                const chunkDetails = await Promise.all(chunkPromises);
                const validDetails = chunkDetails.filter(d => d !== null);
                
                if (validDetails.length > 0) {
                    try {
                        analyzedNew.push(...await scoreEmails(validDetails));
                    } catch (e: any) {
                        console.error(`[API/Emails] Failed to score chunk: ${e.message}`);
                    }
                }
                if (i + CHUNK_SIZE < newMessages.length) await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        let refreshedCached = cached;
        const staleCached = cached.filter(email => email.scoring_version !== SCORING_ALGORITHM_VERSION);
        if (staleCached.length > 0 && isPythonReady) {
            if (!cacheRefreshesInProgress.has(userEmail)) {
                cacheRefreshesInProgress.add(userEmail);
                console.log(`[API/Emails] Scheduling background re-score for ${staleCached.length} cached messages...`);
                setImmediate(async () => {
                    try {
                        const latestCached = getCachedEmails(userEmail);
                        const latestStale = latestCached.filter(email => email.scoring_version !== SCORING_ALGORITHM_VERSION);
                        if (latestStale.length === 0) return;

                        console.log(`[API/Emails] Background re-scoring ${latestStale.length} cached messages for deadline-time parser update...`);
                        const rescored = await scoreEmails(latestStale);
                        const rescoredById = new Map(rescored.map(email => [email.id, email]));
                        const updatedCached = latestCached.map(email => rescoredById.get(email.id) || email);
                        overwriteCache(userEmail, updatedCached);
                        console.log(`[API/Emails] Background cache re-score complete.`);
                    } catch (e: any) {
                        console.error(`[API/Emails] Failed background cached message re-score: ${e.message}`);
                    } finally {
                        cacheRefreshesInProgress.delete(userEmail);
                    }
                });
            } else {
                console.log('[API/Emails] Background cache re-score already in progress.');
            }
        }

        if (analyzedNew.length > 0) {
            overwriteCache(userEmail, [...analyzedNew, ...refreshedCached]);
        }

        console.timeEnd('FetchEmails');

        const localReadEmails = getReadEmails(userEmail);
        const allEmails = [...analyzedNew, ...refreshedCached];
        
        console.log(`[API/Emails] Returning ${allEmails.length} total emails to frontend`);
        const finalResults = allEmails.map(email => {
            const scored = calculateInstantScore(email, settings);
            const isReadLocally = localReadEmails.includes(scored.id);
            return {
                ...scored,
                isUnread: isReadLocally ? false : (email as any).isUnread
            };
        });

        res.json(finalResults);
    } catch (err: any) {
        console.error('[API/Emails] Fatal Error:', err.message);
        if (err.message && (err.message.includes('No refresh token') || err.message.includes('invalid_grant'))) {
            return res.status(401).json({ error: 'Authentication expired' });
        }
        res.status(500).json({ error: `Failed to fetch emails: ${err.message}` });
    }
});

api.post('/emails/mark-read', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Email ID is required' });
    
    try {
        const userEmail = await getCurrentUserEmail();
        if (userEmail) {
            markEmailAsRead(userEmail, id);
            res.json({ success: true });
        } else {
            res.status(401).json({ error: 'Not authenticated' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to mark as read' });
    }
});

api.post('/user/delete-account', async (req, res) => {
    try {
        const userEmail = await getCurrentUserEmail();
        if (userEmail) {
            deleteUserCache(userEmail);
            deleteUserSettings(userEmail);
            userTokens = null;
            cachedUserEmail = null;
            if (fs.existsSync(TOKENS_FILE)) {
                fs.unlinkSync(TOKENS_FILE);
            }
            res.json({ success: true });
        } else {
            res.status(401).json({ error: 'Not authenticated' });
        }
    } catch (err) {
        console.error('Delete Account Error:', err);
        res.status(500).json({ error: 'Failed to delete account' });
    }
});

api.get('/user/profile', async (req, res) => {
    if (!userTokens) return res.status(401).json({ error: 'Not authenticated' });
    try {
        const profile = await getUserProfile(userTokens);
        res.json(profile);
    } catch (err: any) {
        console.error('Fetch Profile Error:', err);
        if (err.message && (err.message.includes('No refresh token') || err.message.includes('invalid_grant'))) {
            return res.status(401).json({ error: 'Authentication expired' });
        }
        res.status(500).json({ error: `Failed to fetch user profile: ${err.message}` });
    }
});

api.get('/settings', async (req, res) => {
    try {
        const userEmail = await getCurrentUserEmail();
        if (!userEmail) return res.status(401).json({ error: 'Not authenticated' });
        
        const settings = getUserSettings(userEmail);
        res.json(settings);
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to load settings' });
    }
});

api.post('/settings', async (req, res) => {
    try {
        const userEmail = await getCurrentUserEmail();
        if (!userEmail) return res.status(401).json({ error: 'Not authenticated' });
        
        const newSettings = req.body;
        saveUserSettings(userEmail, newSettings);
        
        const cached = getCachedEmails(userEmail);
        if (cached.length > 0) {
            const updated = cached.map(email => calculateInstantScore(email, newSettings));
            overwriteCache(userEmail, updated);
        }
        
        res.json({ success: true });
    } catch (err: any) {
        console.error('Failed to update settings:', err);
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

api.post('/prioritize', async (req, res) => {
    const { email, reference_date } = req.body;
    const userEmail = await getCurrentUserEmail();
    
    try {
        const response = await axios.post(`${PYTHON_SERVICE_URL}/prioritize`, {
            emails: email,
            settings_path: path.join(STORAGE_DIR, `settings/${userEmail?.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`),
            user_email: userEmail || '',
            reference_date: reference_date
        });
        res.json(response.data);
    } catch (err: any) {
        console.error('Prioritization Error:', err.message);
        if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
            return res.status(503).json({ error: 'AI Scoring Engine is still warming up. Please try again in a moment.' });
        }
        res.status(500).json({ error: 'Scoring engine error' });
    }
});

api.post('/prioritize-batch', async (req, res) => {
    const { emails, reference_date } = req.body;
    if (!Array.isArray(emails)) return res.status(400).json({ error: 'Expected an array' });

    const userEmail = await getCurrentUserEmail();
    if (!userEmail) return res.status(401).json({ error: 'Not authenticated' });
    
    try {
        const batchPromises = [];
        const BATCH_SIZE = 10; 
        for (let i = 0; i < emails.length; i += BATCH_SIZE) {
            const chunk = emails.slice(i, i + BATCH_SIZE);
            batchPromises.push(
                axios.post(`${PYTHON_SERVICE_URL}/prioritize`, {
                    emails: chunk,
                    settings_path: path.join(STORAGE_DIR, `settings/${userEmail.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`),
                    user_email: userEmail,
                    reference_date: reference_date
                }, { timeout: 300000 }).then(res => res.data).catch(e => {
                    console.error('Batch chunk error:', e.message);
                    throw e;
                })
            );
        }

        const batchResults = await Promise.all(batchPromises);
        res.json(batchResults.flat());
    } catch (err: any) {
        console.error('Batch Prioritization Error:', err.message);
        if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
            return res.status(503).json({ error: 'AI Scoring Engine is still warming up. Please try again in a moment.' });
        }
        res.status(500).json({ error: 'Scoring engine error' });
    }
});

api.post('/prioritize-freeze-frame', async (req, res) => {
    const { startDate, endDate } = req.body;
    if (!startDate || !endDate) return res.status(400).json({ error: 'Dates required' });
    if (!userTokens) return res.status(401).json({ error: 'Not authenticated' });

    try {
        const userEmail = await getCurrentUserEmail();
        if (!userEmail) return res.status(401).json({ error: 'Not authenticated' });
        
        const start = startDate.replace(/-/g, '/');
        const endObj = new Date(endDate);
        endObj.setDate(endObj.getDate() + 1);
        const end = !isNaN(endObj.getTime()) ? endObj.toISOString().split('T')[0]!.replace(/-/g, '/') : '';
        
        console.time('FreezeFrame');
        const messages = await listEmails(userTokens, `after:${start} before:${end}`);
        if (messages.length === 0) return res.json([]);

        const settings = getUserSettings(userEmail);
        const now = new Date();
        const endOfSelected = new Date(endDate);
        endOfSelected.setHours(23, 59, 59, 999);
        const simulationNow = endOfSelected.toDateString() === now.toDateString() ? now : endOfSelected;
        const localReadEmails = getReadEmails(userEmail);
        const cached = getCachedEmails(userEmail);
        const cachedById = new Map(cached.map(email => [email.id, email]));
        const requestedIds = messages.slice(0, 100).map(m => m.id!).filter(Boolean);
        const cachedDetails = requestedIds
            .map(id => cachedById.get(id))
            .filter((email): email is NonNullable<typeof email> => Boolean(email));
        const missingIds = requestedIds.filter(id => !cachedById.has(id));

        console.log(`[FreezeFrame] ${requestedIds.length} messages in range. Using ${cachedDetails.length} cached, fetching/scoring ${missingIds.length} missing.`);

        const prioritized: any[] = cachedDetails.map(email => {
            const scored = calculateInstantScore(email, settings, simulationNow);
            const isReadLocallyForScoredEmail = localReadEmails.includes(scored.id);
            return { ...scored, isUnread: isReadLocallyForScoredEmail ? false : scored.isUnread };
        });

        if (missingIds.length === 0) {
            console.timeEnd('FreezeFrame');
            return res.json(prioritized);
        }

        const detailPromises = missingIds.map(id => getEmailDetails(userTokens, id).catch(() => null));
        const details = (await Promise.all(detailPromises)).filter((email): email is NonNullable<typeof email> => Boolean(email));

        const CHUNK_SIZE = 10;
        
        for (let i = 0; i < details.length; i += CHUNK_SIZE) {
            const chunk = details.slice(i, i + CHUNK_SIZE);
            console.log(`[FreezeFrame] Scoring missing chunk ${i / CHUNK_SIZE + 1}/${Math.ceil(details.length / CHUNK_SIZE)}...`);
            const response = await axios.post(`${PYTHON_SERVICE_URL}/prioritize`, {
                emails: chunk,
                settings_path: path.join(STORAGE_DIR, `settings/${userEmail.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`),
                user_email: userEmail,
                reference_date: new Date(endDate).toISOString()
            }, { timeout: 60000 });
            
            const chunkPrioritized = chunk.map((email: any, index: number) => {
                const merged = { ...email, ...(response.data[index] as any), scoring_version: SCORING_ALGORITHM_VERSION };
                const scored = calculateInstantScore(merged, settings, simulationNow);
                const isReadLocallyForScoredEmail = localReadEmails.includes(scored.id);
                return { ...scored, isUnread: isReadLocallyForScoredEmail ? false : scored.isUnread };
            });
            prioritized.push(...chunkPrioritized);
        }

        if (details.length > 0) {
            const newCachedById = new Map(cached.map(email => [email.id, email]));
            prioritized.forEach(email => newCachedById.set(email.id, email));
            overwriteCache(userEmail, Array.from(newCachedById.values()));
        }

        console.timeEnd('FreezeFrame');
        res.json(prioritized);
    } catch (err: any) {
        console.error('Freeze-Frame Error:', err.message);
        if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
            return res.status(503).json({ error: 'AI Scoring Engine is still warming up. Please try again in a moment.' });
        }
        res.status(500).json({ error: `Freeze-Frame failed: ${err.message}` });
    }
});

app.use('/api', api);

// Catch-all for 404s within the app
app.use((req, res) => {
    console.warn(`[404] ${req.method} ${req.url} - Not Found`);
    res.status(404).json({ 
        error: `Route ${req.method} ${req.url} not found`,
        availableRoutes: ['/api/auth/url', '/api/emails', '/api/settings', '/health']
    });
});

// Start Python immediately
startPythonService();
waitForPythonService(100); // Check in background

// Start Express
const serverPort = Number(process.env.PORT) || 5000;
app.listen(serverPort, '0.0.0.0', () => {
    console.log(`✓ Express server running on port ${serverPort}`);
    console.log(`✓ Allowed origins: ${allowedOrigins.join(', ')}`);
    console.log(`✓ Current Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`✓ Auth Redirect URI: ${process.env.GOOGLE_REDIRECT_URI || 'not set'}`);
    console.log(`✓ Frontend URL: ${process.env.FRONTEND_URL || 'defaulting based on host'}`);
});

