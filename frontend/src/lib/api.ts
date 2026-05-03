const API_BASE = 'http://localhost:5000/api';

async function handleResponse(res: Response) {
    if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || `HTTP error! status: ${res.status}`);
    }
    return res.json();
}

export const getSettings = async () => {
    const res = await fetch(`${API_BASE}/settings`, { cache: 'no-store' });
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
    const res = await fetch(`${API_BASE}/auth/url`, { cache: 'no-store' });
    return handleResponse(res);
};

export const getEmails = async (mode?: string) => {
    const url = mode ? `${API_BASE}/emails?mode=${mode}` : `${API_BASE}/emails`;
    const res = await fetch(url, { cache: 'no-store' });
    return handleResponse(res);
};

export const prioritizeEmail = async (email: any, referenceDate?: string) => {
    const res = await fetch(`${API_BASE}/prioritize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, reference_date: referenceDate })
    });
    if (res.status === 503) {
        const data = await res.json().catch(() => ({}));
        if (data.error?.includes('warming up')) {
            return { ...email, total_score: 0, factors: {}, error: true, warmingUp: true };
        }
    }
    return handleResponse(res);
};

export const prioritizeEmailsBatch = async (emails: any[], referenceDate?: string) => {
    const res = await fetch(`${API_BASE}/prioritize-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails, reference_date: referenceDate })
    });
    if (res.status === 503) {
        const data = await res.json().catch(() => ({}));
        if (data.error?.includes('warming up')) {
            return emails.map(() => ({ total_score: 0, factors: {}, error: true, warmingUp: true }));
        }
    }
    return handleResponse(res);
};

export const logout = async () => {
    const res = await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST'
    });
    return handleResponse(res);
};

export const prioritizeFreezeFrame = async (startDate: string, endDate: string) => {
    const res = await fetch(`${API_BASE}/prioritize-freeze-frame`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate })
    });
    if (res.status === 503) {
        const data = await res.json().catch(() => ({}));
        if (data.error?.includes('warming up')) {
            throw new Error('AI Scoring Engine is still warming up. Please try again in a few moments.');
        }
    }
    return handleResponse(res);
};

export const getUserProfile = async () => {
    const res = await fetch(`${API_BASE}/user/profile`, { cache: 'no-store' });
    return handleResponse(res);
};
