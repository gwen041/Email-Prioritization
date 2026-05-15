'use client';
import { useState, useMemo } from 'react';
import { prioritizeFreezeFrame, logout, getUserProfile } from '@/lib/api';
import Logo from '@/components/Logo';
import Link from 'next/link';
import { useEffect } from 'react';

export default function Timeline() {
    const [emails, setEmails] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [userProfile, setUserProfile] = useState<any>(null);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const [activeTab, setActiveTab] = useState<'Active' | 'Past Due'>('Active');
    const [pastDueSort, setPastDueSort] = useState<'urgency' | 'chronological'>('urgency');

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const profile = await getUserProfile();
                if (profile) setUserProfile(profile);
            } catch (err) {
                console.error('Failed to fetch profile', err);
            }
        };
        fetchProfile();
    }, []);

    const handleRunSimulation = async () => {
        if (!startDate || !endDate) {
            setError('Please select both start and end dates');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const results = await prioritizeFreezeFrame(startDate, endDate);
            
            const sorted = results.sort((a: any, b: any) => {
                // Primary Sort: Total Urgency Score (higher is better)
                const scoreDiff = (b.total_score || 0) - (a.total_score || 0);
                if (scoreDiff !== 0) return scoreDiff;
                
                // Secondary Sort: Chronological (Oldest deadline first)
                const dateA = a.deadline ? new Date(a.deadline).getTime() : Infinity;
                const dateB = b.deadline ? new Date(b.deadline).getTime() : Infinity;
                return dateA - dateB;
            });
            
            setEmails(sorted);
            if (sorted.length > 0) setSelectedId(sorted[0].id);
        } catch (err: any) {
            console.error('Simulation Error:', err);
            setError(err.message || 'Failed to run simulation');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            await logout();
            window.location.href = '/';
        } catch (err) {
            window.location.href = '/';
        }
    };

    const activeCount = useMemo(() => emails.filter(e => e.urgency_label !== 'Past Due').length, [emails]);
    const pastDueCount = useMemo(() => emails.filter(e => e.urgency_label === 'Past Due').length, [emails]);

    const filteredEmails = useMemo(() => {
        const filtered = emails.filter(e => {
            if (activeTab === 'Active') {
                return e.urgency_label !== 'Past Due';
            } else {
                return e.urgency_label === 'Past Due';
            }
        });

        // Apply dynamic sorting for Past Due items
        if (activeTab === 'Past Due') {
            filtered.sort((a, b) => {
                if (pastDueSort === 'urgency') {
                    // Primary Sort: Total Urgency Score (higher is better)
                    const scoreDiff = (b.total_score || 0) - (a.total_score || 0);
                    if (scoreDiff !== 0) return scoreDiff;
                    // Tiebreaker: Newest first (fresher tasks first)
                    const dateA = a.deadline ? new Date(a.deadline).getTime() : 0;
                    const dateB = b.deadline ? new Date(b.deadline).getTime() : 0;
                    return dateB - dateA;
                } else {
                    // Secondary Sort: Chronological (oldest deadline first to clear backlog systematically)
                    const dateA = a.deadline ? new Date(a.deadline).getTime() : Infinity;
                    const dateB = b.deadline ? new Date(b.deadline).getTime() : Infinity;
                    if (dateA !== dateB) return dateA - dateB;
                    // Tiebreaker: Score
                    return (b.total_score || 0) - (a.total_score || 0);
                }
            });
        } else {
            // Default sort for Active tab
            filtered.sort((a: any, b: any) => {
                const scoreDiff = (b.total_score || 0) - (a.total_score || 0);
                if (scoreDiff !== 0) return scoreDiff;
                const dateA = a.deadline ? new Date(a.deadline).getTime() : Infinity;
                const dateB = b.deadline ? new Date(b.deadline).getTime() : Infinity;
                return dateA - dateB;
            });
        }

        return filtered;
    }, [emails, activeTab, pastDueSort]);

    const selectedEmail = useMemo(() => {
        return emails.find(e => e.id === selectedId);
    }, [emails, selectedId]);

    const todayDate = useMemo(() => {
        const d = new Date();
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    }, []);

    return (
        <div className="h-screen max-h-screen bg-[#F8F9FF] flex flex-col font-sans text-slate-900 overflow-hidden">
            {loading && (
                <div className="fixed inset-0 bg-white/80 z-50 flex flex-col items-center justify-center">
                    <div className="w-12 h-12 border-4 border-slate-100 border-t-[#2E2996] rounded-full animate-spin mb-4" />
                    <p className="text-[#2E2996] font-bold text-xs uppercase tracking-widest">Running Simulation...</p>
                </div>
            )}
            <header className="h-16 md:h-20 bg-white border-b border-slate-100 flex items-center px-4 md:px-8 lg:px-10 justify-between sticky top-0 z-20 shrink-0 gap-4">
                <div className="flex items-center gap-4 md:gap-12 shrink-0">
                    <Logo size="sm" showText={true} />
                    
                    {/* Desktop Navigation */}
                    <nav className="hidden lg:flex gap-6 md:gap-8 text-xs font-bold uppercase tracking-widest">
                        <Link href="/dashboard" className="text-slate-400 hover:text-slate-600 transition-colors">Inbox</Link>
                        <Link href="/timeline" className="text-[#2E2996] border-b-2 border-[#2E2996] pb-1">Timeline</Link>
                        <Link href="/log-reports" className="text-slate-400 hover:text-slate-600 transition-colors">Log Reports</Link>
                        <Link href="/settings" className="text-slate-400 hover:text-slate-600 transition-colors">Settings</Link>
                    </nav>
                </div>

                <div className="flex items-center gap-2 md:gap-4 shrink-0 relative">
                    {/* Mobile Menu Button */}
                    <div className="lg:hidden relative">
                        <button 
                            onClick={() => setShowMobileMenu(!showMobileMenu)}
                            className="p-2 text-slate-400 hover:text-[#2E2996] hover:bg-slate-50 rounded-lg transition-colors flex items-center justify-center mr-1"
                            title="Navigation Menu"
                        >
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line>
                            </svg>
                        </button>

                        {showMobileMenu && (
                            <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-100 rounded-xl shadow-xl z-50 py-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                <Link href="/dashboard" className="block px-6 py-2.5 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-[#2E2996] hover:bg-slate-50">Inbox</Link>
                                <Link href="/timeline" className="block px-6 py-2.5 text-[11px] font-black uppercase tracking-widest text-[#2E2996] bg-indigo-50/50">Timeline</Link>
                                <Link href="/log-reports" className="block px-6 py-2.5 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-[#2E2996] hover:bg-slate-50">Log Reports</Link>
                            </div>
                        )}
                    </div>

                    <Link href="/settings" className="lg:hidden mr-1 text-slate-400 hover:text-slate-600">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    </Link>
                    
                    <button 
                        onClick={() => setShowUserMenu(!showUserMenu)}
                        className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center overflow-hidden border border-orange-200 shadow-sm hover:ring-2 hover:ring-[#2E2996]/10 transition-all"
                    >
                         {userProfile?.picture ? (
                             <img src={userProfile.picture} alt="User" referrerPolicy="no-referrer" />
                         ) : (
                             <span className="text-orange-600 font-bold text-xs uppercase">
                                 {userProfile?.name?.split(' ').map((n: any) => n[0]).join('').substring(0, 2) || 'JD'}
                             </span>
                         )}
                    </button>

                    {showUserMenu && (
                        <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-100 rounded-lg shadow-xl z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="px-4 py-3 border-b border-slate-50 mb-1">
                                <p className="text-xs font-bold text-slate-800 truncate">{userProfile?.name || 'Guest User'}</p>
                                <p className="text-[10px] text-slate-400 truncate mt-0.5">{userProfile?.email || ''}</p>
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

            <div className="bg-white border-b border-slate-100 p-4 flex flex-wrap items-center gap-4 justify-center">
                <div className="flex items-center gap-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Start</label>
                    <input 
                        type="date" 
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        max={todayDate}
                        className="bg-slate-50 border border-slate-100 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#2E2996]"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">End ("Today")</label>
                    <input 
                        type="date" 
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        max={todayDate}
                        className="bg-slate-50 border border-slate-100 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#2E2996]"
                    />
                </div>
                <button 
                    onClick={handleRunSimulation}
                    disabled={loading}
                    className="bg-[#2E2996] text-white px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] hover:bg-indigo-700 transition-all shadow-md disabled:opacity-50"
                >
                    {loading ? 'Processing...' : 'Check'}
                </button>
            </div>

            {error && (
                <div className="bg-red-50 border-b border-red-100 p-3 text-center text-[11px] text-red-600 font-bold uppercase tracking-wider">
                    {error}
                </div>
            )}

            <div className="flex flex-1 overflow-hidden h-full">
                <aside className={`${selectedId ? 'hidden md:flex' : 'flex'} w-full md:w-[380px] lg:w-[400px] h-full border-r border-slate-100 bg-white flex-col shrink-0`}>
                    <div className="px-4 py-3 md:px-6 md:py-4 border-b border-slate-50 shrink-0">
                        <div className="flex gap-4">
                            <button 
                                onClick={() => setActiveTab('Active')}
                                className={`text-[11px] font-black uppercase tracking-[0.2em] pb-1 transition-all ${
                                    activeTab === 'Active' ? 'text-[#2E2996] border-b-2 border-[#2E2996]' : 'text-slate-400 hover:text-slate-600'
                                }`}
                            >
                                Active ({activeCount})
                            </button>
                            <button 
                                onClick={() => setActiveTab('Past Due')}
                                className={`text-[11px] font-black uppercase tracking-[0.2em] pb-1 transition-all ${
                                    activeTab === 'Past Due' ? 'text-slate-600 border-b-2 border-slate-600' : 'text-slate-400 hover:text-slate-600'
                                }`}
                            >
                                Past Due ({pastDueCount})
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {activeTab === 'Past Due' && emails.some(e => e.urgency_label === 'Past Due') && (
                             <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2 px-2">Sort Backlog By:</p>
                                <div className="flex flex-col gap-2">
                                    <button 
                                        onClick={() => setPastDueSort('urgency')}
                                        className={`text-left px-3 py-2 rounded-lg transition-all border ${
                                            pastDueSort === 'urgency' 
                                                ? 'bg-indigo-50 border-indigo-200 text-indigo-900 shadow-sm' 
                                                : 'bg-white border-transparent text-slate-500 hover:bg-slate-100'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className={`w-1.5 h-1.5 rounded-full ${pastDueSort === 'urgency' ? 'bg-[#2E2996]' : 'bg-slate-300'}`} />
                                            <span className="text-[10px] font-black uppercase tracking-widest">Primary Sort: Urgency Score</span>
                                        </div>
                                        <p className="text-[9px] text-slate-400 pl-3.5 leading-relaxed">
                                            Prioritizes "fresher" late tasks (recently missed deadlines score higher).
                                        </p>
                                    </button>

                                    <button 
                                        onClick={() => setPastDueSort('chronological')}
                                        className={`text-left px-3 py-2 rounded-lg transition-all border ${
                                            pastDueSort === 'chronological' 
                                                ? 'bg-indigo-50 border-indigo-200 text-indigo-900 shadow-sm' 
                                                : 'bg-white border-transparent text-slate-500 hover:bg-slate-100'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className={`w-1.5 h-1.5 rounded-full ${pastDueSort === 'chronological' ? 'bg-[#2E2996]' : 'bg-slate-300'}`} />
                                            <span className="text-[10px] font-black uppercase tracking-widest">Secondary Sort: Chronological</span>
                                        </div>
                                        <p className="text-[9px] text-slate-400 pl-3.5 leading-relaxed">
                                            Sorts by oldest deadline first to systematically clear out the oldest backlog.
                                        </p>
                                    </button>
                                </div>
                            </div>
                        )}
                        {emails.length === 0 && !loading && (
                            <div className="p-8 text-center text-slate-400 text-xs font-medium italic">
                                No emails found for the selected range.
                            </div>
                        )}
                        {filteredEmails.map((email) => (
                            <div 
                                key={email.id}
                                onClick={() => setSelectedId(email.id)}
                                className={`p-4 md:p-6 border-b border-slate-50 cursor-pointer transition-all relative hover:bg-slate-50 ${
                                    selectedId === email.id ? 'bg-indigo-50/30' : ''
                                }`}
                            >
                                {/* Active Indicator Border */}
                                <div className={`absolute left-0 top-0 bottom-0 w-1 transition-all ${
                                    email.urgency_label === 'Past Due' ? 'bg-slate-400' :
                                    email.urgency_label === 'High' ? 'bg-red-500' :
                                    email.urgency_label === 'Medium' ? 'bg-yellow-500' :
                                    email.urgency_label === 'Low' ? 'bg-emerald-500' :
                                    'bg-slate-300'
                                }`} />

                                <div className="flex gap-4">
                                    {/* Small Score Box */}
                                    <div className={`w-14 h-14 shrink-0 rounded-lg flex flex-col items-center justify-center shadow-sm border ${
                                        selectedId === email.id ? 'bg-white border-indigo-100' : 'bg-slate-50 border-slate-100'
                                    }`}>
                                        <span className={`text-sm font-black ${
                                            email.urgency_label === 'Past Due' ? 'text-slate-500' :
                                            email.urgency_label === 'High' ? 'text-red-600' :
                                            email.urgency_label === 'Medium' ? 'text-yellow-600' :
                                            email.urgency_label === 'Low' ? 'text-emerald-600' :
                                            'text-slate-500'
                                        }`}>
                                            {Math.round(email.total_score || 0)}%
                                        </span>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-1">
                                            <div className="flex items-center gap-2 pr-2 truncate">
                                                <h3 className="text-sm font-bold text-slate-800 truncate">{email.subject || '(No Subject)'}</h3>
                                            </div>
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
                                        </div>
                                        {/* Mini Scoring Logic Bars */}
                                        <div className="mt-3 flex gap-1 h-1 w-full bg-slate-100 rounded-full overflow-hidden opacity-60 group-hover:opacity-100 transition-opacity">
                                            <div className="bg-[#2E2996] h-full" style={{ width: `${((email.factors?.deadline?.raw || 0) / 40) * 100}%` }} />
                                            <div className="bg-blue-500 h-full" style={{ width: `${((email.factors?.sender?.raw || 0) / 30) * 100}%` }} />
                                            <div className="bg-indigo-400 h-full" style={{ width: `${((email.factors?.complexity?.raw || 0) / 20) * 100}%` }} />
                                            <div className="bg-red-400 h-full" style={{ width: `${((email.factors?.escalation?.raw || 0) / 10) * 100}%` }} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </aside>

                <main className={`${selectedId ? 'flex' : 'hidden md:flex'} flex-1 flex-col h-full bg-slate-50 overflow-y-auto`}>
                    {selectedEmail ? (
                        <div className="p-8 md:p-12 max-w-4xl mx-auto w-full">
                            <div className="flex justify-between items-start mb-12">
                                <div>
                                    <span className="text-[#2E2996] text-[10px] font-black tracking-[0.2em] uppercase">Timeline Entry</span>
                                    <h2 className="text-3xl font-extrabold text-[#1A1A1A] mt-2 leading-tight">
                                        {selectedEmail.subject}
                                    </h2>
                                </div>
                                <div className="text-right flex flex-col items-end">
                                    <span className={`text-7xl font-black italic tracking-tighter ${
                                        selectedEmail.total_score >= 80 ? 'text-red-700' :
                                        selectedEmail.total_score >= 50 ? 'text-blue-700' :
                                        'text-[#2E2996]'
                                    }`}>
                                        {Math.round(selectedEmail.total_score || 0)}%
                                    </span>
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2 mr-2">Urgency Percentage</span>
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

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-10">
                                        {Object.entries(selectedEmail.factors || {}).map(([key, factor]: [string, any]) => (
                                            <div key={key} className="space-y-3">
                                                <div className="flex justify-between text-[11px] font-bold tracking-tight">
                                                    <span className="text-slate-600 uppercase">{key.replace('_', ' ')}</span>
                                                    <span className="text-slate-900">{Math.round((factor.raw || 0) * 10) / 10}/{key === 'deadline' ? '40' : key === 'sender' ? '30' : key === 'complexity' ? '20' : '10'}</span>
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

                                    <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-100">
                                        <p className="text-sm leading-relaxed text-slate-600 font-medium italic">
                                            &quot;{selectedEmail.explanation}&quot;
                                        </p>
                                    </div>
                                </section>

                                <section className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Message Content</h3>
                                    <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                                        {selectedEmail.body}
                                    </div>
                                </section>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center min-h-full text-slate-300">
                            <p className="font-black uppercase tracking-[0.4em] text-[10px]">Pick a month to see results</p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
