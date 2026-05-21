import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const READ_STATUS_PATH = path.resolve(__dirname, '../../../data/read_status.json');

interface ReadStatus {
    [email: string]: string[]; // Mapping user email to list of read message IDs
}

export const getReadEmails = (userEmail: string): string[] => {
    try {
        if (!fs.existsSync(READ_STATUS_PATH)) return [];
        const data: ReadStatus = JSON.parse(fs.readFileSync(READ_STATUS_PATH, 'utf-8'));
        return data[userEmail] || [];
    } catch (err) {
        console.error('Error reading read_status.json:', err);
        return [];
    }
};

export const markEmailAsRead = (userEmail: string, messageId: string) => {
    try {
        let data: ReadStatus = {};
        if (fs.existsSync(READ_STATUS_PATH)) {
            data = JSON.parse(fs.readFileSync(READ_STATUS_PATH, 'utf-8'));
        }
        
        if (!data[userEmail]) data[userEmail] = [];
        if (!data[userEmail].includes(messageId)) {
            data[userEmail].push(messageId);
            fs.writeFileSync(READ_STATUS_PATH, JSON.stringify(data, null, 2));
        }
    } catch (err) {
        console.error('Error writing to read_status.json:', err);
    }
};
