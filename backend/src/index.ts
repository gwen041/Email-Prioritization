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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const PYTHON_SERVICE_URL = 'http://127.0.0.1:8000';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SETTINGS_FILE = path.join(__dirname, '../settings.json');
const TOKENS_FILE = path.join(__dirname, '../tokens.json');

// Default weight settings
const defaultSettings = {
    weights: {
        deadline_weight: 40,
        sender_weight: 30,
        task_weight: 20,
        escalation_weight: 10
    },
    important_senders: []
};

// Ensure files exist
if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
}

let userTokens: any = null;

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
    if (fs.existsSync(TOKENS_FILE)) {
        fs.unlinkSync(TOKENS_FILE);
    }
    res.json({ success: true });
});

app.get('/api/emails', async (req, res) => {
    if (!userTokens) return res.status(401).json({ error: 'Not authenticated' });
    try {
        console.time('FetchEmails');
        // Fetch up to 200 emails for a snappy performance with real accounts
        const messages = await listEmails(userTokens, undefined, 200);
        
        // Fetch details in throttled chunks to avoid rate limits and memory pressure
        const details: any[] = [];
        const CHUNK_SIZE = 50;
        for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
            const chunk = messages.slice(i, i + CHUNK_SIZE);
            const chunkPromises = chunk.map(m => getEmailDetails(userTokens, m.id!).catch(err => {
                console.error(`Error fetching email ${m.id}:`, err.message);
                return { 
                    id: m.id, 
                    error: true, 
                    subject: '(Error fetching email)',
                    body: '',
                    from: '',
                    date: new Date().toISOString()
                };
            }));
            const chunkDetails = await Promise.all(chunkPromises);
            details.push(...chunkDetails);
            
            // 200ms delay between chunks to respect Gmail API rate limits (250 quota units/sec)
            if (i + CHUNK_SIZE < messages.length) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
        
        console.timeEnd('FetchEmails');

        // Merge Gmail's isUnread status with local read_status.json
        const userEmail = await getCurrentUserEmail();
        const localReadEmails = userEmail ? getReadEmails(userEmail) : [];
        
        const detailsWithReadStatus = details.map(d => {
            if (localReadEmails.includes(d.id)) {
                return { ...d, isUnread: false };
            }
            return d;
        });

        res.json(detailsWithReadStatus);
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
    try {
        const profile = await getUserProfile(userTokens);
        return profile?.email || null;
    } catch {
        return null;
    }
}

app.get('/api/settings', async (req, res) => {
    try {
        const userEmail = await getCurrentUserEmail();
        const allSettings = fs.existsSync(SETTINGS_FILE)
            ? JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'))
            : {};
        
        const settings = (userEmail && allSettings[userEmail])
            ? allSettings[userEmail]
            : defaultSettings;
        
        res.json(settings);
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to load settings' });
    }
});

app.post('/api/settings', async (req, res) => {
    try {
        const userEmail = await getCurrentUserEmail();
        const allSettings = fs.existsSync(SETTINGS_FILE)
            ? JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'))
            : {};
        
        const key = userEmail || '__default__';
        allSettings[key] = req.body;
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(allSettings, null, 2));
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
            settings_path: SETTINGS_FILE,
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
    console.log(`[Batch Prioritize] Received ${emails.length} emails. Reference Date: ${reference_date}`);
    if (!Array.isArray(emails)) {
        return res.status(400).json({ error: 'Expected an array of emails' });
    }

    const userEmail = await getCurrentUserEmail();
    
    try {
        const isHealthy = await waitForPythonService(2);
        if (!isHealthy) {
            return res.status(503).json({ error: 'AI Scoring Engine is still warming up' });
        }

        const batchPromises = [];
        const BATCH_SIZE = 50; 
        for (let i = 0; i < emails.length; i += BATCH_SIZE) {
            const chunk = emails.slice(i, i + BATCH_SIZE);
            batchPromises.push(
                axios.post(`${PYTHON_SERVICE_URL}/prioritize`, {
                    emails: chunk,
                    settings_path: SETTINGS_FILE,
                    user_email: userEmail || '',
                    reference_date: reference_date
                }, { timeout: 60000 })
                .then(res => res.data)
                .catch(err => {
                    console.error('Batch error:', err.message);
                    return chunk.map(() => ({ error: true, total_score: 0, urgency_label: 'Low', factors: {} }));
                })
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
    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    if (!userTokens) return res.status(401).json({ error: 'Not authenticated' });

    try {
        const userEmail = await getCurrentUserEmail();
        
        // 1. Fetch emails in range
        // Gmail query format: after:YYYY/MM/DD before:YYYY/MM/DD
        // Convert YYYY-MM-DD to YYYY/MM/DD for better compatibility
        const start = startDate.replace(/-/g, '/');
        
        // Add 1 day to endDate so the 'before:' query includes emails sent ON the endDate
        const endObj = new Date(endDate);
        endObj.setDate(endObj.getDate() + 1);
        const end = endObj.toISOString().split('T')[0].replace(/-/g, '/');
        
        const query = `after:${start} before:${end}`;
        console.log(`Date Report query: ${query}`);
        
        const messages = await listEmails(userTokens, query);
        if (messages.length === 0) {
            return res.json([]);
        }

        // Fetch details for up to 100 emails for reports
        const detailPromises = messages.slice(0, 100).map(m => getEmailDetails(userTokens, m.id!));
        const details = await Promise.all(detailPromises);

        // 2. Score with Reference Date (endDate)
        const isHealthy = await waitForPythonService(2);
        if (!isHealthy) {
            return res.status(503).json({ error: 'AI Scoring Engine is still warming up' });
        }

        const response = await axios.post(`${PYTHON_SERVICE_URL}/prioritize`, {
            emails: details,
            settings_path: SETTINGS_FILE,
            user_email: userEmail || '',
            reference_date: new Date().toISOString()
        });

        // Merge scores with email details and apply local read status
        const localReadEmails = userEmail ? getReadEmails(userEmail) : [];
        const prioritized = details.map((email: any, index: number) => {
            const isUnread = localReadEmails.includes(email.id) ? false : email.isUnread;
            return { ...email, isUnread, ...response.data[index] };
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
