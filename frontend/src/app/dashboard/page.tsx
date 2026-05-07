'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { getEmails, prioritizeEmail, prioritizeEmailsBatch, logout, getUserProfile, markAsRead } from '@/lib/api';
import Logo from '@/components/Logo';
import Link from 'next/link';

export default function Dashboard() {
    const [emails, setEmails] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [rankingActive, setRankingActive] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isWarmingUp, setIsWarmingUp] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [userProfile, setUserProfile] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'High' | 'Medium' | 'Low' | 'Past Due'>('High');
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
    const [pastDueSort, setPastDueSort] = useState<'urgency' | 'chronological'>('urgency');
    const knownEmailIds = useRef<Set<string>>(new Set());
    const [isLoggingOut, setIsLoggingOut] = useState(false); // New state for logout loading

    const handleLogout = async () => {
        setIsLoggingOut(true); // Set loading state
        try {
            await logout();
            window.location.href = '/';
        } catch (err) {
            console.error('Logout failed:', err);
            window.location.href = '/';
        }
    };

    useEffect(() => {
        let isFetching = false;
        
        const fetchAllData = async (isBackground = false) => {
            if (isFetching) return;
            isFetching = true;
            let currentIsWarming = false;
            
            if (isBackground) {
                console.log(`[${new Date().toLocaleTimeString()}] Dashboard auto-refreshing emails...`);
            } else {
                setLoading(true);
            }
            setError(null);
            
            try {
                if (!isBackground) {
                    // Set rankingActive early so user sees "Analyzing & Ranking" while backend works
                    setRankingActive(true);
                }
                const userPromise = getUserProfile();
                const emailsPromise = getEmails();
                
                const [profile, data] = await Promise.all([userPromise, emailsPromise]);
                
                if (profile) setUserProfile(profile);
                
                // ── STEP 2: Process Results ──
                try {
                    // Note: The backend now returns ALL persistent/cached emails + new ones,
                    // so we don't need to manually accumulate in the frontend anymore.
                    const sorted = data.sort((a: any, b: any) => {
                        const scoreDiff = (b.total_score || 0) - (a.total_score || 0);
                        if (scoreDiff !== 0) return scoreDiff;
                        
                        // Secondary sort: Oldest deadline first
                        const dateA = a.deadline ? new Date(a.deadline).getTime() : Infinity;
                        const dateB = b.deadline ? new Date(b.deadline).getTime() : Infinity;
                        return dateA - dateB;
                    });
                    
                    if (knownEmailIds.current.size > 0) {
                        sorted.forEach((email: any) => {
                            if (!knownEmailIds.current.has(email.id)) {
                                email.isNewArrival = true;
                                console.log('New email detected:', email.subject);
                            }
                        });
                    }
                    // Update the ref with all IDs we have now seen
                    sorted.forEach((email: any) => knownEmailIds.current.add(email.id));
                    
                    setEmails(sorted);
                    
                    if (!isBackground) {
                        setLoading(false);
                        // Removed: if (sorted.length > 0) setSelectedId(sorted[0].id);
                    }
                } catch (batchErr: any) {
                    console.error('Batch Prioritization Error:', batchErr);
                    
                    const isWarming = batchErr.message?.includes('warming up') || (batchErr.message && batchErr.message.includes('503'));
                    if (isWarming) {
                        currentIsWarming = true;
                        setIsWarmingUp(true);
                        setError('The AI Scoring Engine is still warming up. Please wait...');
                        // Keep loading = true, don't show unscored emails
                    } else {
                        setError('Priority scoring failed. Please retry.');
                        // Even on other errors, it's safer to not show unscored emails to avoid confusion
                        if (!isBackground) setLoading(false);
                    }
                }
            } catch (err: any) {
                console.error('Fetch All Data Error:', err);
                
                const isWarming = err.message?.includes('warming up') || (err.message && err.message.includes('503'));
                
                if (err.message?.includes('401')) {
                    window.location.href = '/login';
                    return;
                }

                if (isWarming) {
                    currentIsWarming = true;
                    setIsWarmingUp(true);
                    // Keep loading = true, don't show the error bar
                    if (isBackground) {
                        // If it's a background refresh, we just wait for the next interval
                    } else {
                        // Keep the main loading spinner visible
                        setLoading(true);
                    }
                } else {
                    setError(err.message || 'Failed to connect to backend server');
                    if (!isBackground) setLoading(false);
                }
            } finally {
                // Only reset these if we are actually done (success) or a hard error (not warming up)
                if (!currentIsWarming) {
                    setRankingActive(false);
                }
                isFetching = false;
            }
        };

        fetchAllData(false);
        const intervalId = setInterval(() => fetchAllData(true), 30000);
        
        return () => clearInterval(intervalId);
    }, []);

    // Reset selected month when tab changes
    useEffect(() => {
        setSelectedMonth(null);
    }, [activeTab]);

    const pastDueMonths = useMemo(() => {
        const pastDueEmails = emails.filter(e => e.urgency_label === 'Past Due');
        const months = new Set<string>();
        pastDueEmails.forEach(e => {
            if (e.date) {
                const date = new Date(e.date);
                const monthYear = date.toLocaleDateString([], { month: 'long', year: 'numeric' });
                months.add(monthYear);
            }
        });
        return Array.from(months).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    }, [emails]);

    const filteredEmails = useMemo(() => {
        let filtered = emails.filter(e => {
            const matchesSearch = (e.subject || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                                 (e.from || '').toLowerCase().includes(searchQuery.toLowerCase());
            if (!matchesSearch) return false;
            
            if (e.urgency_label !== activeTab) return false;
            
            if (activeTab === 'Past Due' && selectedMonth) {
                const date = new Date(e.date);
                const monthYear = date.toLocaleDateString([], { month: 'long', year: 'numeric' });
                return monthYear === selectedMonth;
            }
            
            return true;
        });

        // Apply dynamic sorting for Past Due items inside a month
        if (activeTab === 'Past Due' && selectedMonth) {
            filtered.sort((a, b) => {
                if (pastDueSort === 'urgency') {
                    // Primary Sort: Total Urgency Score (higher is better, relies on backend negative proximity decay)
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
        }

        return filtered;
    }, [emails, searchQuery, activeTab, selectedMonth, pastDueSort]);

    const highCount = useMemo(() => emails.filter(e => e.urgency_label === 'High').length, [emails]);
    const mediumCount = useMemo(() => emails.filter(e => e.urgency_label === 'Medium').length, [emails]);
    const lowCount = useMemo(() => emails.filter(e => e.urgency_label === 'Low').length, [emails]);
    const pastDueCount = useMemo(() => emails.filter(e => e.urgency_label === 'Past Due').length, [emails]);
    const unreadCount = useMemo(() => emails.filter(e => e.isUnread).length, [emails]);

    const handleEmailClick = async (id: string) => {
        setSelectedId(id);
        
        // Find the email and mark it as read locally
        const email = emails.find(e => e.id === id);
        if (email && email.isUnread) {
            try {
                // Update local state immediately for UI responsiveness
                setEmails(prev => prev.map(e => e.id === id ? { ...e, isUnread: false } : e));
                
                // Tell the backend to track this as read
                await markAsRead(id);
            } catch (err) {
                console.error('Failed to mark email as read:', err);
            }
        }
    };

    const selectedEmail = useMemo(() => {
        return emails.find(e => e.id === selectedId);
    }, [emails, selectedId]);
if (loading || isLoggingOut) { // Include isLoggingOut in loading check
    return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center">
            <div className="w-12 h-12 border-4 border-slate-100 border-t-[#2E2996] rounded-full animate-spin mb-4" />
            <p className="text-slate-400 font-bold text-xs uppercase tracking-widest text-center px-4">
                {isLoggingOut ? 'Logging out...' : (
                    isWarmingUp ? 'AI Scoring Engine is warming up...' : (
                        rankingActive ? 'Analyzing & Ranking Emails...' : 'Reading Inbox...'
                    )
                )}
            </p>
            {(rankingActive || isWarmingUp) && !isLoggingOut && ( // Don't show "This may take a while" during logout
                <p className="text-[10px] text-slate-300 mt-2 font-medium">This may take a while</p>
            )}
        </div>
    );
}
    return (
        <div className="h-screen max-h-screen bg-[#F8F9FF] flex flex-col font-sans text-slate-900 overflow-hidden">
            {/* Top Navigation */}
            <header className="h-16 md:h-20 bg-white border-b border-slate-100 flex items-center px-4 md:px-8 lg:px-10 justify-between sticky top-0 z-20 shrink-0 gap-4">
                <div className="flex items-center gap-4 md:gap-12 shrink-0">
                    <Logo size="sm" showText={true} />
                    
                    {/* Desktop Navigation */}
                    <nav className="hidden lg:flex gap-6 md:gap-8 text-xs font-bold uppercase tracking-widest">
                        <Link href="/dashboard" className="text-[#2E2996] border-b-2 border-[#2E2996] pb-1">Inbox</Link>
                        <Link href="/timeline" className="text-slate-400 hover:text-slate-600 transition-colors">Timeline</Link>
                        <Link href="/log-reports" className="text-slate-400 hover:text-slate-600 transition-colors">Log Reports</Link>
                        <Link href="/settings" className="text-slate-400 hover:text-slate-600 transition-colors">Settings</Link>
                    </nav>
                </div>

                <div className="flex-1 max-w-2xl hidden sm:block">
                    <div className="relative group">
                        <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#2E2996] transition-colors" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <input 
                            type="text" 
                            placeholder="Search.." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-100 rounded-lg py-2 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E2996]/10 focus:bg-white transition-all shadow-inner"
                        />
                    </div>
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
                            <div className="absolute right-0 top-12 w-48 bg-white border border-slate-100 rounded-xl shadow-xl z-50 py-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                <Link href="/dashboard" className="block px-6 py-2.5 text-[11px] font-black uppercase tracking-widest text-[#2E2996] bg-indigo-50/50">Inbox</Link>
                                <Link href="/timeline" className="block px-6 py-2.5 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-[#2E2996] hover:bg-slate-50">Timeline</Link>
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
                        <div className="absolute right-0 top-12 w-48 bg-white border border-slate-100 rounded-lg shadow-xl z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
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
                {/* Sidebar: full-screen on mobile when no email selected, fixed-width on desktop */}
                <aside className={`${selectedId ? 'hidden md:flex' : 'flex'} w-full md:w-[380px] lg:w-[400px] h-full border-r border-slate-100 bg-white flex-col shrink-0`}>
                    <div className="px-4 py-3 md:px-6 md:py-4 border-b border-slate-50 shrink-0">
                        <div className="flex gap-4">
                            <button 
                                onClick={() => setActiveTab('High')}
                                className={`text-[11px] font-black uppercase tracking-[0.2em] pb-1 transition-all ${
                                    activeTab === 'High' ? 'text-red-600 border-b-2 border-red-600' : 'text-slate-400 hover:text-slate-600'
                                }`}
                            >
                                High ({highCount})
                            </button>
                            <button 
                                onClick={() => setActiveTab('Medium')}
                                className={`text-[11px] font-black uppercase tracking-[0.2em] pb-1 transition-all ${
                                    activeTab === 'Medium' ? 'text-yellow-600 border-b-2 border-yellow-600' : 'text-slate-400 hover:text-slate-600'
                                }`}
                            >
                                Medium ({mediumCount})
                            </button>
                            <button 
                                onClick={() => setActiveTab('Low')}
                                className={`text-[11px] font-black uppercase tracking-[0.2em] pb-1 transition-all ${
                                    activeTab === 'Low' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-slate-400 hover:text-slate-600'
                                }`}
                            >
                                Low ({lowCount})
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
                        {activeTab === 'Past Due' && !selectedMonth ? (
                            <div className="p-6 grid grid-cols-1 gap-4">
                                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Past Due Archive</h2>
                                {pastDueMonths.map(month => (
                                    <button 
                                        key={month}
                                        onClick={() => setSelectedMonth(month)}
                                        className="w-full bg-white border border-slate-100 p-4 rounded-xl shadow-sm hover:shadow-md hover:border-[#2E2996]/30 transition-all flex justify-between items-center group text-left"
                                    >
                                        <div>
                                            <span className="text-sm font-bold text-slate-800">{month}</span>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                                                {emails.filter(e => e.urgency_label === 'Past Due' && new Date(e.date).toLocaleDateString([], { month: 'long', year: 'numeric' }) === month).length} Messages
                                            </p>
                                        </div>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-slate-300 group-hover:text-[#2E2996] transition-colors">
                                            <polyline points="9 18 15 12 9 6"></polyline>
                                        </svg>
                                    </button>
                                ))}
                                {pastDueMonths.length === 0 && (
                                    <div className="text-center py-20">
                                        <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">No past due emails found</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
                                {activeTab === 'Past Due' && selectedMonth && (
                                    <div className="bg-slate-50 border-b border-slate-100">
                                        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100/50">
                                            <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">{selectedMonth}</span>
                                            <button 
                                                onClick={() => setSelectedMonth(null)}
                                                className="text-[10px] font-black text-[#2E2996] uppercase tracking-widest flex items-center gap-1 hover:underline"
                                            >
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                                                Back
                                            </button>
                                        </div>
                                        
                                        {/* Sort Controls */}
                                        <div className="px-4 py-3 bg-white/50">
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
                                                        Prioritizes "fresher" late tasks (recently missed deadlines score higher to be salvaged quickly).
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
                                                        Sorts by oldest deadline first to systematically clear out the oldest backlog items.
                                                    </p>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {filteredEmails.map((email) => (
                                    <div 
                                        key={email.id}
                                        onClick={() => handleEmailClick(email.id)}
                                        className={`p-4 md:p-6 border-b border-slate-50 cursor-pointer transition-all relative hover:bg-slate-50 ${
                                            selectedId === email.id ? 'bg-indigo-50/30' : ''
                                        } ${email.isUnread ? 'font-bold' : ''}`}
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
                                                        {email.isNewArrival && (
                                                            <span className="shrink-0 bg-indigo-600 text-white text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded animate-pulse">NEW</span>
                                                        )}
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
                                                        <div className="flex gap-1 items-center">
                                                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest text-[white] ${
                                                                email.urgency_label === 'High' ? 'bg-red-500' :
                                                                email.urgency_label === 'Medium' ? 'bg-yellow-500' :
                                                                email.urgency_label === 'Low' ? 'bg-emerald-500' :
                                                                'bg-slate-500'
                                                            }`}>
                                                                {email.urgency_label}
                                                            </span>
                                                            {email.urgency_label === 'Past Due' && email.deadline && (
                                                                <span className="text-[10px] font-black text-red-600 uppercase italic ml-1">
                                                                    {(() => {
                                                                        const days = Math.floor((new Date().getTime() - new Date(email.deadline).getTime()) / (1000 * 60 * 60 * 24));
                                                                        return days > 0 ? `• ${days} day${days === 1 ? '' : 's'} ago` : '';
                                                                    })()}
                                                                </span>
                                                            )}
                                                        </div>
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
                            </>
                        )}
                    </div>
                </aside>

                {/* Main Detail: full-screen on mobile when email selected, panel on desktop */}
                <main className={`${selectedId ? 'flex' : 'hidden md:flex'} flex-1 flex-col h-full bg-slate-50 overflow-y-auto scroll-smooth`}>
                    {/* Mobile back button */}
                    {selectedId && (
                        <div className="md:hidden sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3">
                            <button onClick={() => setSelectedId(null)} className="flex items-center gap-2 text-xs font-bold text-[#2E2996] uppercase tracking-widest">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                                Back to Inbox
                            </button>
                        </div>
                    )}
                    <div className="p-4 md:p-12 flex-1">
                    {selectedEmail ? (
                        <div className="max-w-4xl mx-auto animate-fade-in">
                            <div className="flex flex-col md:flex-row justify-between items-start mb-8 md:mb-12 gap-6 md:gap-4">
                                <div className="space-y-4">
                                    <div className="flex gap-3">
                                        <span className="text-[#2E2996] text-[12px] font-black tracking-[0.2em] uppercase self-center">Project Task</span>
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
                                    <h2 className="text-2xl md:text-5xl font-extrabold text-[#1A1A1A] tracking-tight leading-tight max-w-2xl">
                                        {selectedEmail.subject}
                                    </h2>
                                </div>

                                <div className="flex flex-row md:flex-col items-baseline md:items-end gap-2 md:gap-0">
                                    <span className={`text-6xl md:text-8xl font-black italic tracking-tighter ${
                                        selectedEmail.total_score >= 80 ? 'text-red-700' :
                                        selectedEmail.total_score >= 50 ? 'text-blue-700' :
                                        'text-slate-300'
                                    }`}>
                                        {Math.round(selectedEmail.total_score || 0)}%
                                    </span>
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] md:mt-2 md:mr-2">Urgency Percentage</span>
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

                                    <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-100">
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

                                    <div className="bg-white p-6 md:p-10 rounded-2xl shadow-sm border border-slate-100 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap font-sans">
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
                            <p className="font-black uppercase tracking-[0.4em] text-xs text-center px-4">Select a message for analysis</p>
                        </div>
                    )}
                    </div>
                </main>
            </div>
        </div>
    );
}
