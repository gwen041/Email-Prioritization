'use client';
import { useState, useEffect } from 'react';
import { getEmails, prioritizeEmail, getAuthUrl } from '@/lib/api';
import Link from 'next/link';

export default function Inbox() {
    const [emails, setEmails] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [scannedEmails, setScannedEmails] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);

    const fetchEmails = async () => {
        setLoading(true);
        try {
            setError(null);
            const data = await getEmails();
            if (!Array.isArray(data)) {
                throw new Error('Invalid response from server');
            }
            setEmails(data);
            // Prioritize each email
            const prioritized = await Promise.all(
                data.map(async (email: any) => {
                    const result = await prioritizeEmail(email);
                    return { ...email, ...result };
                })
            );
            // Sort by total_score descending
            prioritized.sort((a, b) => b.total_score - a.total_score);
            setScannedEmails(prioritized);
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to fetch or prioritize emails');
        } finally {
            setLoading(false);
        }
    };

    const handleAuth = async () => {
        try {
            setError(null);
            const { url } = await getAuthUrl();
            window.open(url, '_blank');
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to connect to Gmail');
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 p-8 font-sans">
            <header className="flex justify-between items-center mb-10 max-w-6xl mx-auto">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-800">SIFTLY</h1>
                    <p className="text-slate-500">Email Prioritization</p>
                </div>
                <div className="flex gap-4">
                    <button
                        onClick={handleAuth}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-xl shadow-lg font-semibold hover:bg-indigo-700 transition-all active:scale-95"
                    >
                        Connect Gmail
                    </button>
                    <button
                        onClick={fetchEmails}
                        className="px-6 py-2 bg-blue-600 text-white rounded-xl shadow-lg font-semibold hover:bg-blue-700 transition-all active:scale-95"
                    >
                        Refresh & Rank
                    </button>
                    <Link
                        href="/settings"
                        className="px-6 py-2 bg-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-300 transition-all"
                    >
                        Settings
                    </Link>
                </div>
            </header>

            <main className="max-w-6xl mx-auto">
                {error && (
                    <div className="mb-8 p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
                        <span className="text-xl">⚠️</span>
                        <p className="font-semibold">{error}</p>
                        <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600 font-bold">✕</button>
                    </div>
                )}

                {loading ? (
                    <div className="flex flex-col items-center justify-center p-20">
                        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-600 mb-4"></div>
                        <p className="text-slate-600 font-medium">Re-calculating priorities...</p>
                    </div>
                ) : scannedEmails.length > 0 ? (
                    <div className="grid gap-6">
                        {scannedEmails.map((email: any) => (
                            <div key={email.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl hover:scale-[1.01] transition-all duration-300 relative overflow-hidden flex gap-8">
                                {/* Priority Score Column */}
                                <div className="flex flex-col items-center justify-start min-w-[100px]">
                                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black ${email.total_score >= 70 ? 'bg-red-50 text-red-600' :
                                        email.total_score >= 40 ? 'bg-orange-50 text-orange-600' :
                                            'bg-emerald-50 text-emerald-600'
                                        }`}>
                                        {Math.round(email.total_score)}
                                    </div>
                                    <span className="text-[10px] uppercase tracking-widest font-black mt-2 text-slate-400">Prio Score</span>
                                </div>

                                {/* Content Column */}
                                <div className="flex-1">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="text-xl font-bold text-slate-800 line-clamp-1">{email.subject || '(No Subject)'}</h3>
                                        <span className="text-xs font-mono text-slate-400">{new Date(email.date).toLocaleString()}</span>
                                    </div>
                                    <p className="text-slate-500 font-semibold mb-3">{email.from}</p>
                                    <p className="text-slate-400 text-sm line-clamp-2 leading-relaxed">{email.body}</p>

                                    <div className="mt-4 flex gap-2 flex-wrap">
                                        {email.factors.escalated && (
                                            <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-black uppercase tracking-tighter">🚨 Escalated</span>
                                        )}
                                        {email.factors.dependent && (
                                            <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-black uppercase tracking-tighter">🔗 Dependent</span>
                                        )}
                                        <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-bold ring-1 ring-slate-200">
                                            Complexity: {email.factors.complexity}
                                        </span>
                                        {email.deadline && (
                                            <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-black uppercase tracking-tighter">
                                                ⏳ Due {new Date(email.deadline).toLocaleDateString()}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center p-20 bg-white rounded-3xl border-2 border-dashed border-slate-200">
                        <p className="text-slate-400 font-medium">Click "Refresh & Rank" or "Connect Gmail" to begin.</p>
                    </div>
                )}
            </main>
        </div>
    );
}
