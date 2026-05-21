import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { type ScoringSettings } from './fastScorerService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SETTINGS_DIR = path.resolve(__dirname, '../../../data/settings');

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

// Ensure settings directory exists
if (!fs.existsSync(SETTINGS_DIR)) {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
}

const getSettingsFilePath = (userEmail: string) => {
    const safeEmail = userEmail.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    return path.join(SETTINGS_DIR, `${safeEmail}.json`);
};

export const getUserSettings = (userEmail: string): ScoringSettings => {
    try {
        const filePath = getSettingsFilePath(userEmail);
        if (!fs.existsSync(filePath)) return defaultSettings;
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (err) {
        console.error(`Error reading settings for ${userEmail}:`, err);
        return defaultSettings;
    }
};

export const saveUserSettings = (userEmail: string, settings: any) => {
    try {
        const filePath = getSettingsFilePath(userEmail);
        fs.writeFileSync(filePath, JSON.stringify(settings, null, 2));
    } catch (err) {
        console.error(`Error saving settings for ${userEmail}:`, err);
    }
};

export const deleteUserSettings = (userEmail: string) => {
    try {
        const filePath = getSettingsFilePath(userEmail);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (err) {
        console.error(`Error deleting settings for ${userEmail}:`, err);
    }
};

export { defaultSettings };
