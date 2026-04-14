const API_BASE = 'http://localhost:5000/api';

async function handleResponse(res: Response) {
    if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || `HTTP error! status: ${res.status}`);
    }
    return res.json();
}

export const getSettings = async () => {
    const res = await fetch(`${API_BASE}/settings`);
    return handleResponse(res);
};

export const saveSettings = async (settings: any) => {
    const res = await fetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
    });
    return handleResponse(res);
};

export const getAuthUrl = async () => {
    const res = await fetch(`${API_BASE}/auth/url`);
    return handleResponse(res);
};

export const getEmails = async () => {
    const res = await fetch(`${API_BASE}/emails`);
    return handleResponse(res);
};

export const prioritizeEmail = async (email: any) => {
    const res = await fetch(`${API_BASE}/prioritize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    });
    return handleResponse(res);
};
