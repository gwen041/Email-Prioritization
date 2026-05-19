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
import { getCachedEmails, saveEmailsToCache, deleteUserCache, syncCacheStatus, overwriteCache } from './services/emailCacheService.js';
import { calculateInstantScore } from './services/fastScorerService.js';
import { getUserSettings, saveUserSettings, deleteUserSettings, defaultSettings } from './services/settingsService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const PYTHON_SERVICE_URL = 'http://127.0.0.1:8000';

const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:3000',
    'http://127.0.0.1:3000'
].filter(Boolean) as string[];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Move tokens.json to data/ directory for easier volume mounting in Railway
const TOKENS_FILE = path.join(__dirname, '../data/tokens.json');


let userTokens: any = null;
let cachedUserEmail: string | null = null;

// Ensure data directory exists
const DATA_DIR = path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

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
async function waitForPythonService(retries = 10): Promise<boolean> {
    for (let i = 0; i < retries; i++) {
        try {
            await axios.get(`${PYTHON_SERVICE_URL}/health`);
            return true;
        } catch (err) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    return false;
}

function startPythonService() {
    console.log('Starting Python Scoring Service...');

    // Use environment variable for Python path.
    // On Windows, 'python' is more common than 'python3'.
    let pythonPath = process.env.PYTHON_PATH;
    if (!pythonPath) {
        const venvPath = process.platform === 'win32' 
            ? path.join(__dirname, '../../data/venv/Scripts/python.exe')
            : path.join(__dirname, '../../data/venv/bin/python');
        
        if (fs.existsSync(venvPath)) {
            pythonPath = venvPath;
        } else {
            pythonPath = process.platform === 'win32' ? 'python' : 'python3';
        }
    }
    
    // The scoring_service.py is at the root of the project, 
    // and this file is in backend/src/index.ts
    // Go up 2 levels to reach root/data/scoring_service.py
    const scriptPath = path.join(__dirname, '../../data/scoring_service.py');

    console.log(`Spawning Python process: ${pythonPath} ${scriptPath}`);
    const service = spawn(pythonPath, [scriptPath], {
        env: { ...process.env, PYTHONPATH: path.join(__dirname, '../../data') }
    });
    service.stdout.on('data', (data) => {
        console.log(`[Python Service] ${data.toString().trim()}`);
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
        console.log(`Python Service exited with code ${code}. Restarting...`);
        setTimeout(startPythonService, 5000);
    });
    
    return service;
}

startPythonService();

async function init() {
    console.log('Waiting for Python Scoring Service to warm up...');
    const isHealthy = await waitForPythonService(60); // 60 retries * 2 seconds = 120 seconds
    if (isHealthy) {
        console.log('Python Scoring Service is ready. Starting Express server...');
        app.listen(Number(PORT), '0.0.0.0', () => {
            console.log(`Server running on port ${PORT}`);
        });
    } else {
        console.error('Python Scoring Service failed to warm up after multiple retries. Exiting.');
        process.exit(1); // Exit the process if Python service doesn't start
    }
}

init();

app.get('/api/auth/url', (req, res) => {
    res.json({ url: getAuthUrl() });
});

app.get('/api/auth/callback', async (req, res) => {
    const { code } = req.query;
    if (code) {
        try {
            userTokens = await setTokens(code as string);
            cachedUserEmail = null; // Reset cache for new user
            fs.writeFileSync(TOKENS_FILE, JSON.stringify(userTokens, null, 2));
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            res.redirect(`${frontendUrl}/dashboard`);
        } catch (err) {
            console.error('Auth Callback Error:', err);
            res.status(500).send('Authentication failed');
        }
    } else {
        res.status(400).send('No code provided');
    }
});

app.post('/api/auth/logout', (req, res) => {
    userTokens = null;
    cachedUserEmail = null;
    if (fs.existsSync(TOKENS_FILE)) {
        fs.unlinkSync(TOKENS_FILE);
    }
    res.json({ success: true });
});

app.get('/api/emails', async (req, res) => {
    if (!userTokens) return res.status(401).json({ error: 'Not authenticated' });
    try {
        const userEmail = await getCurrentUserEmail();
        if (!userEmail) return res.status(401).json({ error: 'Could not determine user email' });

        // 1. Get User Settings for weight calculation (Now using per-user files)
        const settings = getUserSettings(userEmail);
        const weights = settings.weights;

        console.time('FetchEmails');
        // 2. Load all cached emails for this user
        const cached = getCachedEmails(userEmail);
        const cachedIds = new Set(cached.map(e => e.id));

        // 3. Fetch up to 100 most recent from Gmail
        const messages = await listEmails(userTokens, undefined, 100);
        const currentIds = messages.map(m => m.id!);
        
        // ── SYNC: Fetch IDs of unread messages to update cache status ──
        // This keeps the compliance score accurate even if user reads emails outside the app
        const unreadMessages = await listEmails(userTokens, 'is:unread', 500).catch(() => []);
        const unreadIds = new Set(unreadMessages.map(m => m.id!));
        syncCacheStatus(userEmail, unreadIds, currentIds);
        
        // 4. Identify which ones are truly new
        const newMessages = messages.filter(m => !cachedIds.has(m.id!));
        console.log(`Found ${newMessages.length} new messages out of ${messages.length} fetched.`);

        // 5. Fetch details and run AI only for NEW messages
        let analyzedNew: any[] = [];
        if (newMessages.length > 0) {
            const CHUNK_SIZE = 5;
            for (let i = 0; i < newMessages.length; i += CHUNK_SIZE) {
                const chunk = newMessages.slice(i, i + CHUNK_SIZE);
                const chunkPromises = chunk.map(m => getEmailDetails(userTokens, m.id!).catch(() => null));
                const chunkDetails = await Promise.all(chunkPromises);
                const validDetails = chunkDetails.filter(d => d !== null);
                
                if (validDetails.length > 0) {
                    try {
                        const response = await axios.post(`${PYTHON_SERVICE_URL}/prioritize`, {
                            emails: validDetails,
                            settings_path: path.join(__dirname, `../data/settings/${userEmail.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`),
                            user_email: userEmail,
                            reference_date: new Date().toISOString()
                        }, { timeout: 300000 });
                        analyzedNew.push(...validDetails.map((d, index) => ({ ...d, ...response.data[index] })));
                    } catch (e) {
                        console.error(`Failed to score chunk: ${e}`);
                    }
                }
                if (i + CHUNK_SIZE < newMessages.length) await new Promise(resolve => setTimeout(resolve, 500));
            }
            saveEmailsToCache(userEmail, [...analyzedNew, ...cached]);
        }

        console.timeEnd('FetchEmails');

        // 6. Combine all emails and use FAST SCORER for instant results
        // This replaces the expensive Python call for the entire list
        const localReadEmails = getReadEmails(userEmail);
        const allEmails = [...analyzedNew, ...cached];
        
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
        console.error('Fetch Emails Error:', err);
        if (err.message && (err.message.includes('No refresh token') || err.message.includes('invalid_grant'))) {
            return res.status(401).json({ error: 'Authentication expired' });
        }
        res.status(500).json({ error: `Failed to fetch emails: ${err.message}` });
    }
});

app.post('/api/emails/mark-read', async (req, res) => {
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

app.post('/api/user/delete-account', async (req, res) => {
    try {
        const userEmail = await getCurrentUserEmail();
        if (userEmail) {
            // 1. Delete Email Cache
            deleteUserCache(userEmail);
            
            // 2. Delete Settings
            deleteUserSettings(userEmail);
            
            // 3. Logout & Delete Tokens
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

app.get('/api/user/profile', async (req, res) => {
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

app.get('/api/settings', async (req, res) => {
    try {
        const userEmail = await getCurrentUserEmail();
        if (!userEmail) return res.status(401).json({ error: 'Not authenticated' });
        
        const settings = getUserSettings(userEmail);
        res.json(settings);
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to load settings' });
    }
});

app.post('/api/settings', async (req, res) => {
    try {
        const userEmail = await getCurrentUserEmail();
        if (!userEmail) return res.status(401).json({ error: 'Not authenticated' });
        
        const newSettings = req.body;
        saveUserSettings(userEmail, newSettings);
        
        // ── IMPROVEMENT: Update existing cache with new weights instead of deleting it ──
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

app.post('/api/prioritize', async (req, res) => {
    const { email, reference_date } = req.body;
    const userEmail = await getCurrentUserEmail();
    
    try {
        const response = await axios.post(`${PYTHON_SERVICE_URL}/prioritize`, {
            emails: email,
            settings_path: path.join(__dirname, `../data/settings/${userEmail?.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`),
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

app.post('/api/prioritize-batch', async (req, res) => {
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
                    settings_path: path.join(__dirname, `../data/settings/${userEmail.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`),
                    user_email: userEmail,
                    reference_date: reference_date
                }, { timeout: 300000 }).then(res => res.data).catch(e => {
                    console.error('Batch chunk error:', e.message);
                    throw e; // Rethrow to be caught by the outer catch
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

app.post('/api/prioritize-freeze-frame', async (req, res) => {
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
        
        const messages = await listEmails(userTokens, `after:${start} before:${end}`);
        if (messages.length === 0) return res.json([]);

        const detailPromises = messages.slice(0, 100).map(m => getEmailDetails(userTokens, m.id!));
        const details = await Promise.all(detailPromises);

        // Required declarations for scoring
        const settings = getUserSettings(userEmail);
        const weights = settings.weights;
        const now = new Date();
        const endOfSelected = new Date(endDate);
        endOfSelected.setHours(23, 59, 59, 999);
        const simulationNow = endOfSelected.toDateString() === now.toDateString() ? now : endOfSelected;
        const localReadEmails = getReadEmails(userEmail);

        const CHUNK_SIZE = 10;
        const prioritized: any[] = [];
        
        for (let i = 0; i < details.length; i += CHUNK_SIZE) {
            const chunk = details.slice(i, i + CHUNK_SIZE);
            const response = await axios.post(`${PYTHON_SERVICE_URL}/prioritize`, {
                emails: chunk,
                settings_path: path.join(__dirname, `../data/settings/${userEmail.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`),
                user_email: userEmail,
                reference_date: new Date(endDate).toISOString()
            }, { timeout: 300000 });
            
            const chunkPrioritized = chunk.map((email: any, index: number) => {
                const merged = { ...email, ...(response.data[index] as any) };
                const scored = calculateInstantScore(merged, settings, simulationNow);
                const isReadLocallyForScoredEmail = localReadEmails.includes(scored.id); // Renamed variable to avoid conflict
                return { ...scored, isUnread: isReadLocallyForScoredEmail ? false : scored.isUnread };
            });
            prioritized.push(...chunkPrioritized);
        }

        res.json(prioritized);
    } catch (err: any) {
        console.error('Freeze-Frame Error:', err.message);
        if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
            return res.status(503).json({ error: 'AI Scoring Engine is still warming up. Please try again in a moment.' });
        }
        res.status(500).json({ error: `Freeze-Frame failed: ${err.message}` });
    }
});

