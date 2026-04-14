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
        scope: ['https://www.googleapis.com/auth/gmail.readonly']
    });
};

export const setTokens = async (code: string) => {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    return tokens;
};

export const listEmails = async (tokens: any) => {
    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const res = await gmail.users.messages.list({ userId: 'me', maxResults: 10 });
    return res.data.messages || [];
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
    
    let body = '';
    if (message.payload?.parts && message.payload.parts[0] && message.payload.parts[0].body) {
        body = Buffer.from(message.payload.parts[0].body.data || '', 'base64').toString();
    } else {
        body = Buffer.from(message.payload?.body?.data || '', 'base64').toString();
    }

    return { id, subject, from, date, body };
};
