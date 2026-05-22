import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STORAGE_DIR = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data');
const SETTINGS_DIR = path.join(STORAGE_DIR, 'settings');
const defaultSettings = {
    weights: {
        deadline_weight: 40,
        sender_weight: 30,
        task_weight: 20,
        escalation_weight: 10
    },
    important_senders: []
};
if (!fs.existsSync(SETTINGS_DIR)) {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
}

const getSettingsFilePath = (userEmail: string) => {
    const safeEmail = userEmail.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    return path.join(SETTINGS_DIR, `${safeEmail}.json`);
};

export const getUserSettings = (userEmail: string) => {
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
