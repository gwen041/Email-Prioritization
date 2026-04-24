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
        const messages = await listEmails(userTokens);
        // Limit to top 30 for faster loading
        const detailPromises = messages.slice(0, 30).map(m => getEmailDetails(userTokens, m.id!));
        const details = await Promise.all(detailPromises);
        console.timeEnd('FetchEmails');
        res.json(details);
    } catch (err: any) {
        console.error('Fetch Emails Error:', err);
        res.status(500).json({ error: `Failed to fetch emails: ${err.message}` });
    }
});

app.get('/api/user/profile', async (req, res) => {
    if (!userTokens) return res.status(401).json({ error: 'Not authenticated' });
    try {
        const profile = await getUserProfile(userTokens);
        res.json(profile);
    } catch (err: any) {
        console.error('Fetch Profile Error:', err);
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
    const { email } = req.body;
    const userEmail = await getCurrentUserEmail();
    
    try {
        const isHealthy = await waitForPythonService(2);
        if (!isHealthy) {
            return res.status(503).json({ error: 'AI Scoring Engine is still warming up' });
        }

        const response = await axios.post(`${PYTHON_SERVICE_URL}/prioritize`, {
            emails: email,
            settings_path: SETTINGS_FILE,
            user_email: userEmail || ''
        });
        res.json(response.data);
    } catch (err: any) {
        console.error('Prioritization Error:', err.message);
        res.status(500).json({ error: 'Scoring engine error' });
    }
});

app.post('/api/prioritize-batch', async (req, res) => {
    const { emails } = req.body;
    if (!Array.isArray(emails)) {
        return res.status(400).json({ error: 'Expected an array of emails' });
    }

    const userEmail = await getCurrentUserEmail();
    
    try {
        const isHealthy = await waitForPythonService(2);
        if (!isHealthy) {
            return res.status(503).json({ error: 'AI Scoring Engine is still warming up' });
        }

        const response = await axios.post(`${PYTHON_SERVICE_URL}/prioritize`, {
            emails: emails,
            settings_path: SETTINGS_FILE,
            user_email: userEmail || ''
        });
        res.json(response.data);
    } catch (err: any) {
        console.error('Batch Prioritization Error:', err.message);
        res.status(500).json({ error: 'Scoring engine error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
