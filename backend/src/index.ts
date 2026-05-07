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
import { getCachedEmails, saveEmailsToCache, deleteUserCache } from './services/emailCacheService.js';
import { calculateInstantScore } from './services/fastScorerService.js';
import { getUserSettings, saveUserSettings, deleteUserSettings, defaultSettings } from './services/settingsService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const PYTHON_SERVICE_URL = 'http://127.0.0.1:8000';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TOKENS_FILE = path.join(__dirname, '../tokens.json');


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
    const pythonPath = path.join(__dirname, '../../data/venv/Scripts/python');
    const scriptPath = path.join(__dirname, '../../data/scoring_service.py');
    
    const service = spawn(pythonPath, [scriptPath]);
    
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
            res.redirect('http://localhost:3000/dashboard');
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
        
        // 4. Identify which ones are truly new
        const newMessages = messages.filter(m => !cachedIds.has(m.id!));
        console.log(`Found ${newMessages.length} new messages out of ${messages.length} fetched.`);

        // 5. Fetch details and run AI only for NEW messages
        let analyzedNew: any[] = [];
        if (newMessages.length > 0) {
            const newDetails: any[] = [];
            const CHUNK_SIZE = 50;
            for (let i = 0; i < newMessages.length; i += CHUNK_SIZE) {
                const chunk = newMessages.slice(i, i + CHUNK_SIZE);
                const chunkPromises = chunk.map(m => getEmailDetails(userTokens, m.id!).catch(() => null));
                const chunkDetails = await Promise.all(chunkPromises);
                newDetails.push(...chunkDetails.filter(d => d !== null));
                if (i + CHUNK_SIZE < newMessages.length) await new Promise(resolve => setTimeout(resolve, 200));
            }

            if (newDetails.length > 0) {
                const isHealthy = await waitForPythonService(5);
                if (isHealthy) {
                    const response = await axios.post(`${PYTHON_SERVICE_URL}/prioritize`, {
                        emails: newDetails,
                        settings_path: path.join(__dirname, `../settings/${userEmail.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`),
                        user_email: userEmail,
                        reference_date: new Date().toISOString()
                    });
                    analyzedNew = newDetails.map((d, index) => ({ ...d, ...response.data[index] }));
                    saveEmailsToCache(userEmail, analyzedNew);
                }
            }
        }

        console.timeEnd('FetchEmails');

        // 6. Combine all emails and use FAST SCORER for instant results
        // This replaces the expensive Python call for the entire list
        const localReadEmails = getReadEmails(userEmail);
        const allEmails = [...analyzedNew, ...cached];
        
        const finalResults = allEmails.map(email => {
            const scored = calculateInstantScore(email, weights);
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
        
        saveUserSettings(userEmail, req.body);
        deleteUserCache(userEmail); // Clear cache to force re-analysis with new settings
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

app.post('/api/prioritize', async (req, res) => {
    const { email, reference_date } = req.body;
    const userEmail = await getCurrentUserEmail();
    
    try {
        const isHealthy = await waitForPythonService(2);
        if (!isHealthy) {
            return res.status(503).json({ error: 'AI Scoring Engine is still warming up' });
        }

        const response = await axios.post(`${PYTHON_SERVICE_URL}/prioritize`, {
            emails: email,
            settings_path: path.join(__dirname, `../settings/${userEmail?.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`),
            user_email: userEmail || '',
            reference_date: reference_date
        });
        res.json(response.data);
    } catch (err: any) {
        console.error('Prioritization Error:', err.message);
        res.status(500).json({ error: 'Scoring engine error' });
    }
});

app.post('/api/prioritize-batch', async (req, res) => {
    const { emails, reference_date } = req.body;
    if (!Array.isArray(emails)) return res.status(400).json({ error: 'Expected an array' });

    const userEmail = await getCurrentUserEmail();
    if (!userEmail) return res.status(401).json({ error: 'Not authenticated' });
    
    try {
        const isHealthy = await waitForPythonService(2);
        if (!isHealthy) return res.status(503).json({ error: 'AI Scoring Engine is still warming up' });

        const batchPromises = [];
        const BATCH_SIZE = 50; 
        for (let i = 0; i < emails.length; i += BATCH_SIZE) {
            const chunk = emails.slice(i, i + BATCH_SIZE);
            batchPromises.push(
                axios.post(`${PYTHON_SERVICE_URL}/prioritize`, {
                    emails: chunk,
                    settings_path: path.join(__dirname, `../settings/${userEmail.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`),
                    user_email: userEmail,
                    reference_date: reference_date
                }, { timeout: 60000 }).then(res => res.data)
            );
        }

        const batchResults = await Promise.all(batchPromises);
        res.json(batchResults.flat());
    } catch (err: any) {
        console.error('Batch Prioritization Error:', err.message);
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

        const isHealthy = await waitForPythonService(2);
        if (!isHealthy) return res.status(503).json({ error: 'AI Scoring Engine is warming up' });

        const response = await axios.post(`${PYTHON_SERVICE_URL}/prioritize`, {
            emails: details,
            settings_path: path.join(__dirname, `../settings/${userEmail.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`),
            user_email: userEmail,
            reference_date: new Date(endDate).toISOString()
        });

        // 1. Get User Settings for weight calculation
        const settings = getUserSettings(userEmail);
        const weights = settings.weights;

        // 2. Merge scores with email details and use FAST SCORER for instant results consistency
        // Use endDate as the "simulation now" for accurate scoring in the past
        const now = new Date();
        const endOfSelected = new Date(endDate);
        endOfSelected.setHours(23, 59, 59, 999);
        
        // If the end date is today, use current time. Otherwise use end of that day.
        const simulationNow = endOfSelected.toDateString() === now.toDateString() ? now : endOfSelected;
        const localReadEmails = userEmail ? getReadEmails(userEmail) : [];
        const prioritized = details.map((email: any, index: number) => {
            // First merge the extracted factors from Python
            const merged = { ...email, ...(response.data[index] as any) };
            // Then recalculate final score using Fast Scorer logic (same as Inbox)
            // Pass simulationNow so deadlines are calculated relative to the simulation end date
            const scored = calculateInstantScore(merged, weights, simulationNow);
            const isReadLocally = localReadEmails.includes(scored.id);
            return {
                ...scored,
                isUnread: isReadLocally ? false : scored.isUnread
            };
        });

        res.json(prioritized);
    } catch (err: any) {
        console.error('Freeze-Frame Error:', err.message);
        res.status(500).json({ error: `Freeze-Frame failed: ${err.message}` });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
