import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID as string,
    process.env.GOOGLE_CLIENT_SECRET as string,
    process.env.GOOGLE_REDIRECT_URI as string
);

export const getAuthUrl = () => {
    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/userinfo.email'
        ],
        prompt: 'consent',
        access_type: 'offline'
    });
};

export const setTokens = async (code: string) => {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    return tokens;
};

export const listEmails = async (tokens: any, query?: string, maxToFetch: number = 1000) => {
    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    let allMessages: any[] = [];
    let nextPageToken: string | undefined = undefined;
    
    const requestParams: any = { 
        userId: 'me', 
    };
    if (query) requestParams.q = query;

    do {
        requestParams.maxResults = Math.min(maxToFetch - allMessages.length, 500);
        requestParams.pageToken = nextPageToken;

        const res: any = await gmail.users.messages.list(requestParams);
        
        const messages = res.data.messages || [];
        allMessages = allMessages.concat(messages);
        nextPageToken = res.data.nextPageToken;
        
        if (allMessages.length >= maxToFetch) break;
    } while (nextPageToken);
    
    return allMessages;
};

export const getUserProfile = async (tokens: any) => {
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const res = await oauth2.userinfo.get();
    return res.data;
};

const getBody = (payload: any): string => {
    if (payload.body && payload.body.data) {
        return Buffer.from(payload.body.data, 'base64').toString();
    }
    
    if (payload.parts) {
        // Try to find text/plain first
        const plainTextPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
        if (plainTextPart) return getBody(plainTextPart);
        
        // Then try text/html
        const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
        if (htmlPart) return getBody(htmlPart);
        
        // Recurse into first part if none of the above
        return getBody(payload.parts[0]);
    }
    
    return '';
};

export const getEmailDetails = async (tokens: any, id: string) => {
    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const res = await gmail.users.messages.get({ userId: 'me', id });
    const message = res.data;
    
    const headers = message.payload?.headers;
    const subject = headers?.find(h => h.name === 'Subject')?.value || '';
    const from = headers?.find(h => h.name === 'From')?.value || '';
    const date = headers?.find(h => h.name === 'Date')?.value || '';
    const labels = message.labelIds || [];
    const isUnread = labels.includes('UNREAD');
    
    const body = message.payload ? getBody(message.payload) : '';

    return { id, subject, from, date, body, isUnread, labels };
};
