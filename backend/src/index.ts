import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { spawn } from 'child_process';
import { getAuthUrl, setTokens, listEmails, getEmailDetails, getUserProfile } from './services/gmailService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

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
    const { mode } = req.query;
    
    // Serve Demo Dataset
    if (mode === 'demo') {
        try {
            const demoPath = path.join(__dirname, '../../data/enron_demo_50.json');
            const demoData = JSON.parse(fs.readFileSync(demoPath, 'utf-8'));
            return res.json(demoData);
        } catch (err) {
            console.error('Demo Data Loading Error:', err);
            return res.status(500).json({ error: 'Failed to load demo dataset' });
        }
    }

    if (!userTokens) return res.status(401).json({ error: 'Not authenticated' });
    try {
        const messages = await listEmails(userTokens);
        const details = await Promise.all(
            messages.map(m => getEmailDetails(userTokens, m.id!))
        );
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
    console.log(`[Backend] Prioritizing single email...`);
    
    const userEmail = await getCurrentUserEmail();
    
    const pythonProcess = spawn(path.join(__dirname, '../../data/venv/Scripts/python'), [
        path.join(__dirname, '../../data/scoring_engine.py'),
        SETTINGS_FILE,
        userEmail || ''
    ]);

    let dataString = '';
    let errorString = '';

    pythonProcess.stdin.write(JSON.stringify(email));
    pythonProcess.stdin.end();

    pythonProcess.on('error', (err) => {
        console.error('[Backend] Failed to start Python process:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to start scoring engine' });
        }
    });

    pythonProcess.stdout.on('data', (data) => {
        dataString += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('DEBUG:')) {
            console.log(`[Python] ${msg.trim()}`);
        } else {
            console.error(`[Python Error] ${msg.trim()}`);
            errorString += msg;
        }
    });

    pythonProcess.on('close', (code) => {
        if (code !== 0) {
            console.error(`[Backend] Scoring Engine Exited with code ${code}`);
            return res.status(500).json({ error: `Scoring engine failed: ${errorString || 'Internal failure'}` });
        }
        try {
            console.log(`[Backend] Prioritization complete.`);
            res.json(JSON.parse(dataString));
        } catch (e) {
            res.status(500).json({ error: 'Failed to parse engine output' });
        }
    });
});

app.post('/api/prioritize-batch', async (req, res) => {
    const { emails } = req.body;
    if (!Array.isArray(emails)) {
        return res.status(400).json({ error: 'Expected an array of emails' });
    }

    console.log(`[Backend] Batch prioritizing ${emails.length} emails...`);

    const userEmail = await getCurrentUserEmail();

    const pythonProcess = spawn(path.join(__dirname, '../../data/venv/Scripts/python'), [
        path.join(__dirname, '../../data/scoring_engine.py'),
        SETTINGS_FILE,
        userEmail || ''
    ]);

    let dataString = '';
    let errorString = '';

    pythonProcess.stdin.write(JSON.stringify(emails));
    pythonProcess.stdin.end();

    pythonProcess.on('error', (err) => {
        console.error('[Backend] Failed to start Python process (Batch):', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to start scoring engine' });
        }
    });

    pythonProcess.stdout.on('data', (data) => {
        dataString += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('DEBUG:')) {
            console.log(`[Python] ${msg.trim()}`);
        } else {
            console.error(`[Python Error] ${msg.trim()}`);
            errorString += msg;
        }
    });

    pythonProcess.on('close', (code) => {
        if (code !== 0) {
            console.error(`[Backend] Scoring Engine (Batch) Exited with code ${code}`);
            return res.status(500).json({ error: `Scoring engine failed: ${errorString || 'Internal failure'}` });
        }
        try {
            console.log(`[Backend] Batch prioritization complete.`);
            res.json(JSON.parse(dataString));
        } catch (e) {
            console.error(`[Backend] Parse error: ${e}`);
            res.status(500).json({ error: 'Failed to parse engine output' });
        }
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
