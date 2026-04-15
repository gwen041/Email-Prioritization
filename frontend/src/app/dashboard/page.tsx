'use client';
import { useState, useEffect, useMemo } from 'react';
import { getEmails, prioritizeEmail, prioritizeEmailsBatch, logout } from '@/lib/api';
import Logo from '@/components/Logo';
import Link from 'next/link';

export default function Dashboard() {
    const [emails, setEmails] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isDemoMode, setIsDemoMode] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);

    const handleLogout = async () => {
        try {
            await logout();
            localStorage.removeItem('datasetMode');
            window.location.href = '/';
        } catch (err) {
            console.error('Logout failed:', err);
            // Fallback: clear local and redirect anyway
            localStorage.removeItem('datasetMode');
            window.location.href = '/';
        }
    };

    // PERSISTENCE FIX: Ensure dashboard always inherits mode from landing
    useEffect(() => {
        const mode = localStorage.getItem('datasetMode');
        setIsDemoMode(mode === 'demo');
        
        const fetchAllData = async () => {
            setLoading(true);
            try {
                const data = await getEmails(mode || undefined);
                
                // PERFORMANCE OPTIMIZATION: USE BATCH PRIORITIZATION
                // This reduces loading from ~20s to <3s by spawning only ONE Python process
                const prioritizationResults = await prioritizeEmailsBatch(data);
                
                const prioritized = data.map((email: any, index: number) => {
                    const result = prioritizationResults[index];
                    if (result && !result.error) {
                        return { ...email, ...result };
                    }
                    return { ...email, total_score: 0, factors: {}, error: true };
                });
                
                const sorted = prioritized.sort((a: any, b: any) => (b.total_score || 0) - (a.total_score || 0));
                setEmails(sorted);
                if (sorted.length > 0) setSelectedId(sorted[0].id);
            } catch (err: any) {
                console.error('Fetch All Data Error:', err);
                if (err.message.includes('401') || err.message.toLowerCase().includes('not authenticated')) {
                    localStorage.removeItem('datasetMode');
                    window.location.href = '/login';
                    return;
                }
                setError(err.message || 'Failed to load inbox');
            } finally {
                setLoading(false);
            }
        };
        fetchAllData();
    }, []);

    const filteredEmails = useMemo(() => {
        return emails.filter(e => 
            (e.subject || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (e.from || '').toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [emails, searchQuery]);

    const selectedEmail = useMemo(() => {
        return emails.find(e => e.id === selectedId);
    }, [emails, selectedId]);

    if (loading) return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center">
            <div className="w-12 h-12 border-4 border-slate-100 border-t-[#2E2996] rounded-full animate-spin mb-4" />
            <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Hydrating Dashboard...</p>
        </div>
    );

    return (
        <div className="h-screen max-h-screen bg-[#F8F9FF] flex flex-col font-sans text-slate-900 overflow-hidden">
            {/* Top Navigation */}
            <header className="h-20 bg-white border-b border-slate-100 flex items-center px-10 justify-between sticky top-0 z-20">
                <div className="flex items-center gap-12">
                    <Logo size="sm" showText={true} />
                    <nav className="flex gap-8 text-xs font-bold uppercase tracking-widest">
                        <Link href="/dashboard" className="text-[#2E2996] border-b-2 border-[#2E2996] pb-1">Inbox ({emails.length})</Link>
                        <Link href="/settings" className="text-slate-400 hover:text-slate-600 transition-colors">Settings</Link>
                    </nav>
                </div>

                <div className="flex-1 max-w-2xl px-12">
                    <div className="relative group">
                        <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#2E2996] transition-colors" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <input 
                            type="text" 
                            placeholder="Search.." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-100 rounded-lg py-2.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E2996]/10 focus:bg-white transition-all shadow-inner"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-4 relative">
                    <button 
                        onClick={() => setShowUserMenu(!showUserMenu)}
                        className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center overflow-hidden border border-orange-200 shadow-sm hover:ring-2 hover:ring-[#2E2996]/10 transition-all"
                    >
                         <span className="text-orange-600 font-bold text-xs uppercase">{isDemoMode ? 'DM' : 'JD'}</span>
                    </button>

                    {showUserMenu && (
                        <div className="absolute right-0 top-12 w-48 bg-white border border-slate-100 rounded-lg shadow-xl z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="px-4 py-2 border-b border-slate-50 mb-1">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isDemoMode ? 'Demo Session' : 'Google Session'}</p>
                            </div>
                            <button 
                                onClick={handleLogout}
                                className="w-full text-left px-4 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line>
                                </svg>
                                Log Out
                            </button>
                        </div>
                    )}
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden h-full">
                {/* Sidebar - Ranked Feed */}
                <aside className="w-[400px] h-full border-r border-slate-100 bg-white flex flex-col">
                    <div className="p-6 border-b border-slate-50 shrink-0">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Ranked Feed</h2>
                            <span className="bg-indigo-50 text-[#2E2996] px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase">V 2.1</span>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {filteredEmails.map((email) => (
                            <div 
                                key={email.id}
                                onClick={() => setSelectedId(email.id)}
                                className={`p-6 border-b border-slate-50 cursor-pointer transition-all relative hover:bg-slate-50 ${
                                    selectedId === email.id ? 'bg-indigo-50/30' : ''
                                }`}
                            >
                                {/* Active Indicator Border */}
                                <div className={`absolute left-0 top-0 bottom-0 w-1 transition-all ${
                                    email.total_score >= 75 ? 'bg-red-500' :
                                    email.total_score >= 45 ? 'bg-blue-500' :
                                    'bg-slate-300'
                                }`} />

                                <div className="flex gap-4">
                                    {/* Small Score Box */}
                                    <div className={`w-14 h-14 shrink-0 rounded-lg flex flex-col items-center justify-center shadow-sm border ${
                                        selectedId === email.id ? 'bg-white border-indigo-100' : 'bg-slate-50 border-slate-100'
                                    }`}>
                                        <span className={`text-xl font-black ${
                                            email.total_score >= 75 ? 'text-red-600' :
                                            email.total_score >= 45 ? 'text-blue-600' :
                                            'text-slate-500'
                                        }`}>
                                            {Math.round(email.total_score || 0)}
                                        </span>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-1">
                                            <h3 className="text-sm font-bold text-slate-800 truncate pr-2">{email.subject || '(No Subject)'}</h3>
                                        </div>
                                        <p className="text-[11px] text-slate-500 line-clamp-2 mb-3 leading-relaxed">
                                            {email.body}
                                        </p>
                                        <div className="flex gap-2 items-center">
                                            <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                                {email.date ? new Date(email.date).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                                            </span>
                                            {email.classification?.sender === 'High' && (
                                                <span className="bg-orange-50 text-orange-600 border border-orange-100 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest flex items-center gap-1">
                                                    <span className="w-1 h-1 bg-orange-600 rounded-full animate-pulse" /> ACTION REQUIRED
                                                </span>
                                            )}
                                            {isDemoMode && email.ground_truth && (
                                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${
                                                    email.ground_truth === 'High' ? 'bg-red-50 text-red-600 border-red-100' :
                                                    email.ground_truth === 'Medium' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                                    'bg-slate-50 text-slate-500 border-slate-100'
                                                }`}>
                                                    TRUTH: {email.ground_truth}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </aside>

                {/* Main Detail View */}
                <main className="flex-1 h-full bg-slate-50 p-12 overflow-y-auto scroll-smooth">
                    {selectedEmail ? (
                        <div className="max-w-4xl mx-auto animate-fade-in">
                            <div className="flex justify-between items-start mb-12">
                                <div className="space-y-4">
                                    <div className="flex gap-3">
                                        <span className="bg-[#2E2996] text-white px-3 py-1 rounded-md text-[9px] font-bold tracking-widest uppercase">DistilBert V2</span>
                                        <span className="text-[#2E2996] text-[9px] font-black tracking-[0.2em] uppercase self-center">Project Task</span>
                                    </div>
                                    <h2 className="text-5xl font-extrabold text-[#1A1A1A] tracking-tight leading-tight max-w-2xl">
                                        {selectedEmail.subject}
                                    </h2>
                                    {isDemoMode && selectedEmail.ground_truth && (
                                        <div className="flex items-center gap-2 mt-2">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ground Truth Label:</span>
                                            <span className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest ${
                                                selectedEmail.ground_truth === 'High' ? 'bg-red-100 text-red-700' :
                                                selectedEmail.ground_truth === 'Medium' ? 'bg-blue-100 text-blue-700' :
                                                'bg-slate-200 text-slate-600'
                                            }`}>
                                                {selectedEmail.ground_truth}
                                            </span>
                                            {selectedEmail.ground_truth.charAt(0) === (selectedEmail.total_score >= 75 ? 'H' : selectedEmail.total_score >= 45 ? 'M' : 'L') && (
                                                <span className="text-emerald-600 text-[10px] font-black flex items-center gap-1">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                                    AI ACCURATE
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col items-end">
                                    <span className={`text-8xl font-black italic tracking-tighter ${
                                        selectedEmail.total_score >= 75 ? 'text-red-700' :
                                        selectedEmail.total_score >= 45 ? 'text-blue-700' :
                                        'text-slate-300'
                                    }`}>
                                        {Math.round(selectedEmail.total_score || 0)}
                                    </span>
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2 mr-2">Aggregate Index</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-16 mb-16">
                                {/* Scoring Logic */}
                                <div>
                                    <div className="flex gap-3 items-center mb-8 pb-3 border-b border-slate-200">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-slate-400">
                                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                                        </svg>
                                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Scoring Logic</h3>
                                    </div>

                                    <div className="space-y-10">
                                        <div className="space-y-3">
                                            <div className="flex justify-between text-[11px] font-bold tracking-tight">
                                                <span className="text-slate-600 uppercase">Deadline Proximity</span>
                                                <span className="text-slate-900">{selectedEmail.factors.deadline.raw}/40</span>
                                            </div>
                                            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-[#2E2996] rounded-full transition-all duration-1000" 
                                                    style={{ width: `${(selectedEmail.factors.deadline.raw / 40) * 100}%` }} 
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <div className="flex justify-between text-[11px] font-bold tracking-tight">
                                                <span className="text-slate-600 uppercase">Organizational Authority</span>
                                                <span className="text-slate-900">{selectedEmail.factors.sender.raw}/30</span>
                                            </div>
                                            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-blue-500 rounded-full transition-all duration-1000" 
                                                    style={{ width: `${(selectedEmail.factors.sender.raw / 30) * 100}%` }} 
                                                />
                                            </div>
                                        </div>

                                        {selectedEmail.factors.escalation.raw > 0 && (
                                            <div className="bg-red-50 p-6 rounded-lg border border-red-100 flex justify-between items-center animate-in slide-in-from-left-4 duration-500">
                                                <div className="flex gap-4 items-center">
                                                    <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-600">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                                                        </svg>
                                                    </div>
                                                    <span className="text-xs font-bold text-red-800 italic">"ASAP" keyword detected in body</span>
                                                </div>
                                                <span className="text-red-700 font-black tracking-tighter text-xl">+10</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Contextual Analysis */}
                                <div className="sticky top-0 self-start">
                                    <div className="flex gap-3 items-center mb-8 pb-3 border-b border-slate-200">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-slate-400">
                                            <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>
                                        </svg>
                                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Contextual Analysis</h3>
                                    </div>

                                    <div className="bg-white p-10 rounded-2xl shadow-sm border border-slate-100">
                                        <p className="text-sm leading-relaxed text-slate-600 mb-10 font-medium">
                                            {selectedEmail.explanation}
                                        </p>

                                        <div className="flex gap-4">
                                            <button className="flex-1 bg-[#2E2996] text-white py-4 rounded-lg font-bold hover:bg-[#252180] transition-colors shadow-lg shadow-indigo-100 uppercase text-[10px] tracking-widest">
                                                Open Message
                                            </button>
                                            <button className="w-14 bg-slate-50 text-slate-400 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors border border-slate-100">
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                    <circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle>
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <footer className="mt-20 pt-12 border-t border-slate-100 text-center">
                                <p className="text-[9px] font-bold text-slate-300 uppercase tracking-[0.35em]">
                                    Powered by DistilBERT Logic Engine - V2.1.0 - Enterprise Architecture
                                </p>
                            </footer>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-300">
                            <svg className="mb-6 opacity-20" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                                <rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
                            </svg>
                            <p className="font-black uppercase tracking-[0.4em] text-xs">Select a message for analysis</p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
