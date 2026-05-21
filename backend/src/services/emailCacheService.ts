import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { type CachedEmail } from './fastScorerService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STORAGE_DIR = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data');
const CACHE_DIR = path.join(STORAGE_DIR, 'cache');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const getCacheFilePath = (userEmail: string) => {
    // Sanitize email to use as filename
    const safeEmail = userEmail.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    return path.join(CACHE_DIR, `${safeEmail}.json`);
};

export const getCachedEmails = (userEmail: string): CachedEmail[] => {
    try {
        const filePath = getCacheFilePath(userEmail);
        if (!fs.existsSync(filePath)) return [];
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (err) {
        console.error(`Error reading cache for ${userEmail}:`, err);
        return [];
    }
};

const sanitizeText = (text: string): string => {
    if (!text) return '';
    // Remove unusual line terminators that cause VS Code / Editor warnings
    // \u2028 is Line Separator, \u2029 is Paragraph Separator
    return text.replace(/[\u2028\u2029]/g, '');
};

export const saveEmailsToCache = (userEmail: string, emails: CachedEmail[]) => {
    try {
        const filePath = getCacheFilePath(userEmail);
        let existing: CachedEmail[] = [];
        if (fs.existsSync(filePath)) {
            existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
        
        const existingIds = new Set(existing.map(e => e.id));
        const newEmails = emails.filter(e => !existingIds.has(e.id)).map(e => ({
            ...e,
            subject: sanitizeText(e.subject),
            body: sanitizeText(e.body)
        }));
        const updated = [...existing, ...newEmails];
        
        fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
    } catch (err) {
        console.error(`Error writing cache for ${userEmail}:`, err);
    }
};

export const overwriteCache = (userEmail: string, emails: CachedEmail[]) => {
    try {
        const filePath = getCacheFilePath(userEmail);
        fs.writeFileSync(filePath, JSON.stringify(emails, null, 2));
    } catch (err) {
        console.error(`Error overwriting cache for ${userEmail}:`, err);
    }
};

export const syncCacheStatus = (userEmail: string, unreadIds: Set<string>, currentIds: string[]) => {
    try {
        const filePath = getCacheFilePath(userEmail);
        if (!fs.existsSync(filePath)) return;
        
        const data: CachedEmail[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        let changed = false;
        
        const currentIdsSet = new Set(currentIds);
        
        const updated = data.map(email => {
            const wasUnread = email.isUnread;
            const isNowUnread = unreadIds.has(email.id);
            
            // If it's in the unread list, it's definitely unread
            if (isNowUnread && !wasUnread) {
                changed = true;
                return { ...email, isUnread: true };
            }
            
            // If it's NOT in the unread list AND it was just fetched in the recent list, it's definitely read
            if (!isNowUnread && wasUnread && currentIdsSet.has(email.id)) {
                changed = true;
                return { ...email, isUnread: false };
            }
            
            return email;
        });
        
        if (changed) {
            fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
        }
    } catch (err) {
        console.error(`Error syncing cache status for ${userEmail}:`, err);
    }
};

/**
 * Optional: Useful for Google Verification compliance (Data Deletion)
 */
export const deleteUserCache = (userEmail: string) => {
    try {
        const filePath = getCacheFilePath(userEmail);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (err) {
        console.error(`Error deleting cache for ${userEmail}:`, err);
    }
};
