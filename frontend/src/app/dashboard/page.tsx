'use client';
import { useState, useEffect, useMemo } from 'react';
import { getEmails, prioritizeEmail, prioritizeEmailsBatch, logout, getUserProfile } from '@/lib/api';
import Logo from '@/components/Logo';
import Link from 'next/link';

export default function Dashboard() {
    const [emails, setEmails] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [rankingActive, setRankingActive] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isDemoMode, setIsDemoMode] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [userProfile, setUserProfile] = useState<any>(null);

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
        
        let isFetching = false;
        
        const fetchAllData = async (isBackground = false) => {
            if (isFetching) return;
            isFetching = true;
            
            if (!isBackground) {
                setLoading(true);
            }
            setError(null);
            try {
                const data = await getEmails(mode || undefined);
                
                // PERFORMANCE OPTIMIZATION: USE BATCH PRIORITIZATION
                if (!isBackground) {
                    setRankingActive(true);
                }
                try {
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
                    // Only auto-select first item if it's the initial load
                    if (!isBackground && sorted.length > 0) setSelectedId(sorted[0].id);
                } catch (batchErr: any) {
                    console.error('Batch Prioritization Error:', batchErr);
                    // Fallback: show emails even if scoring failed
                    setEmails(data.map((e: any) => ({ ...e, total_score: 0, factors: {}, error: true })));
                    setError('The AI Scoring Engine is still warming up. Some priority scores may be missing.');
                }
            } catch (err: any) {
                console.error('Fetch All Data Error:', err);
                if (err.message.includes('401') || err.message.toLowerCase().includes('not authenticated')) {
                    localStorage.removeItem('datasetMode');
                    window.location.href = '/login';
                    return;
                }
                setError(err.message || 'Failed to connect to backend server');
            } finally {
                if (!isBackground) {
                    setLoading(false);
                    setRankingActive(false);
                }
                isFetching = false;
            }
        };

        const fetchUser = async () => {
            try {
                const profile = await getUserProfile();
                setUserProfile(profile);
            } catch (err) {
                console.error('Failed to fetch user profile:', err);
            }
        };

        fetchAllData(false);
        const intervalId = setInterval(() => fetchAllData(true), 30000);
        if (mode !== 'demo') fetchUser();
        
        return () => clearInterval(intervalId);
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
            <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">
                {rankingActive ? 'Analyzing & Ranking Emails...' : 'Reading Inbox...'}
            </p>
            {rankingActive && (
                <p className="text-[10px] text-slate-300 mt-2 font-medium">This may take a while</p>
            )}
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
                         {userProfile?.picture ? (
                             <img src={userProfile.picture} alt="User" referrerPolicy="no-referrer" />
                         ) : (
                             <span className="text-orange-600 font-bold text-xs uppercase">
                                 {isDemoMode ? 'DM' : userProfile?.name?.split(' ').map((n: any) => n[0]).join('').substring(0, 2) || 'JD'}
                             </span>
                         )}
                    </button>

                    {showUserMenu && (
                        <div className="absolute right-0 top-12 w-48 bg-white border border-slate-100 rounded-lg shadow-xl z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="px-4 py-3 border-b border-slate-50 mb-1">
                                <p className="text-xs font-bold text-slate-800 truncate">{isDemoMode ? 'Demo User' : userProfile?.name || 'Guest User'}</p>
                                <p className="text-[10px] text-slate-400 truncate mt-0.5">{isDemoMode ? 'demo@siftly.io' : userProfile?.email || ''}</p>
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

            {error && (
                <div className="bg-red-50 border-b border-red-100 p-4 flex items-center justify-between animate-in slide-in-from-top duration-300">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-600">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>
                            </svg>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-red-800 uppercase tracking-wider">Synchronization Error</p>
                            <p className="text-[11px] text-red-600 font-medium">{error}</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => window.location.reload()}
                        className="bg-red-600 text-white px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-red-700 transition-colors shadow-sm"
                    >
                        Retry Sync
                    </button>
                </div>
            )}

            <div className="flex flex-1 overflow-hidden h-full">
                {/* Sidebar - Ranked Feed */}
                <aside className="w-[400px] h-full border-r border-slate-100 bg-white flex flex-col">
                    <div className="p-6 border-b border-slate-50 shrink-0">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Ranked Feed</h2>
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
                                        <div className="flex gap-2 items-center mt-1 flex-wrap">
                                            <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                                {email.date ? new Date(email.date).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                                            </span>
                                            {email.urgency_label && (
                                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest text-[white] ${
                                                    email.urgency_label === 'High' ? 'bg-red-500' :
                                                    email.urgency_label === 'Medium' ? 'bg-yellow-500' :
                                                    email.urgency_label === 'Low' ? 'bg-emerald-500' :
                                                    'bg-slate-500'
                                                }`}>
                                                    {email.urgency_label}
                                                </span>
                                            )}
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
                                        <span className="text-[#2E2996] text-[9px] font-black tracking-[0.2em] uppercase self-center">Project Task</span>
                                        {selectedEmail.urgency_label && (
                                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest text-[white] ${
                                                    selectedEmail.urgency_label === 'High' ? 'bg-red-500' :
                                                    selectedEmail.urgency_label === 'Medium' ? 'bg-yellow-500' :
                                                    selectedEmail.urgency_label === 'Low' ? 'bg-emerald-500' :
                                                    'bg-slate-500'
                                            }`}>
                                                {selectedEmail.urgency_label}
                                            </span>
                                        )}
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
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2 mr-2">Priority Score</span>
                                </div>
                            </div>

                            <div className="flex flex-col gap-12">
                                {/* Scoring Logic Section */}
                                <section>
                                    <div className="flex gap-3 items-center mb-6 pb-2 border-b border-slate-100">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-slate-400">
                                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                                        </svg>
                                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Scoring Logic</h3>
                                    </div>

                                    <div className="grid grid-cols-2 gap-x-12 gap-y-10">
                                        {Object.entries(selectedEmail.factors || {}).map(([key, factor]: [string, any]) => (
                                            <div key={key} className="space-y-3">
                                                <div className="flex justify-between text-[11px] font-bold tracking-tight">
                                                    <span className="text-slate-600 uppercase">{key.replace('_', ' ')}</span>
                                                    <span className="text-slate-900">{factor.raw}/{key === 'deadline' ? '40' : key === 'sender' ? '30' : key === 'complexity' ? '20' : '10'}</span>
                                                </div>
                                                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                                                    <div 
                                                        className={`h-full rounded-full transition-all duration-1000 ${
                                                            key === 'deadline' ? 'bg-[#2E2996]' :
                                                            key === 'sender' ? 'bg-blue-500' :
                                                            key === 'complexity' ? 'bg-indigo-400' : 'bg-red-400'
                                                        }`}
                                                        style={{ width: `${(factor.raw / (key === 'deadline' ? 40 : key === 'sender' ? 30 : key === 'complexity' ? 20 : 10)) * 100}%` }} 
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                {/* Contextual Analysis Section */}
                                <section>
                                    <div className="flex gap-3 items-center mb-6 pb-2 border-b border-slate-100">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-slate-400">
                                            <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>
                                        </svg>
                                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Contextual Analysis</h3>
                                    </div>

                                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
                                        <p className="text-sm leading-relaxed text-slate-600 font-medium italic">
                                            "{selectedEmail.explanation}"
                                        </p>
                                    </div>
                                </section>

                                {/* Email Content Section */}
                                <section>
                                    <div className="flex gap-3 items-center mb-6 pb-2 border-b border-slate-100">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-slate-400">
                                            <rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
                                        </svg>
                                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Message Content</h3>
                                    </div>

                                    <div className="bg-white p-10 rounded-2xl shadow-sm border border-slate-100 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap font-sans">
                                        {selectedEmail.body}
                                    </div>
                                </section>
                            </div>

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
