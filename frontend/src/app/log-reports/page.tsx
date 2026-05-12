'use client';
import { useState, useMemo, useEffect } from 'react';
import { getEmails, logout, getUserProfile, prioritizeEmailsBatch } from '@/lib/api';
import Logo from '@/components/Logo';
import Link from 'next/link';

export default function LogReports() {
    const [emails, setEmails] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isWarmingUp, setIsWarmingUp] = useState(false);
    const [userProfile, setUserProfile] = useState<any>(null);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const [activeYear, setActiveYear] = useState<string | null>(null);
    const [isLoggingOut, setIsLoggingOut] = useState(false); // New state for logout loading

    const fetchData = async () => {
        setLoading(true);
        setIsWarmingUp(false);
        try {
            const [data, profile] = await Promise.all([
                getEmails(),
                getUserProfile()
            ]);
            
            if (data && data.length > 0) {
                setEmails(data);

                // Set default active year to latest year with data
                const years: string[] = Array.from(new Set(data.map((e: any) => {
                    if (e.date) return new Date(e.date).getFullYear().toString();
                    return null;
                }))).filter((y): y is string => y !== null).sort((a, b) => parseInt(b) - parseInt(a));
                
                if (years.length > 0) setActiveYear(years[0]);
            }
            
            setUserProfile(profile);
            setLoading(false);
        } catch (err: any) {
            console.error('Failed to fetch data', err);
            const isWarming = err.message?.includes('warming up') || (err.message && err.message.includes('503'));
            if (isWarming) {
                setIsWarmingUp(true);
            } else {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        const init = async () => {
            await fetchData();
        };
        init();
        
        // Auto-retry if warming up
        const intervalId = setInterval(() => {
            if (isWarmingUp) {
                void fetchData();
            }
        }, 5000);
        
        return () => clearInterval(intervalId);
    }, [isWarmingUp]);

    const stats = useMemo(() => {
        if (!emails.length) return null;

        const total = emails.length;
        const high = emails.filter(e => e.urgency_label === 'High').length;
        const medium = emails.filter(e => e.urgency_label === 'Medium').length;
        const low = emails.filter(e => e.urgency_label === 'Low').length;
        const pastDue = emails.filter(e => e.urgency_label === 'Past Due').length;
        const avgScore = emails.reduce((acc, e) => acc + (e.total_score || 0), 0) / total;

        // Compliance: % of High/Medium emails that are read
        const highPriorityEmails = emails.filter(e => e.urgency_label === 'High' || e.urgency_label === 'Medium');
        const highRead = highPriorityEmails.filter(e => !e.isUnread).length;
        const compliance = highPriorityEmails.length ? (highRead / highPriorityEmails.length) * 100 : 100;

        // Keyword hits
        const keywords: Record<string, number> = {};
        emails.forEach(e => {
            const kw = e.factors?.escalation?.evidence;
            if (kw) {
                keywords[kw] = (keywords[kw] || 0) + 1;
            }
        });
        const sortedKeywords = Object.entries(keywords)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        // Monthly Email Volume grouped by Year (ensuring all months are present for graph)
        const volumeByYear: Record<string, Record<string, number>> = {};
        const monthsOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        emails.forEach(e => {
            if (e.date) {
                const date = new Date(e.date);
                const year = date.getFullYear().toString();
                const monthShort = date.toLocaleDateString([], { month: 'short' });
                
                if (!volumeByYear[year]) {
                    volumeByYear[year] = {};
                    monthsOrder.forEach(m => volumeByYear[year][m] = 0);
                }
                volumeByYear[year][monthShort]++;
            }
        });
        
        const sortedYears = Object.entries(volumeByYear)
            .sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
            .map(([year, months]) => {
                const monthEntries = Object.entries(months).sort((a, b) => 
                    monthsOrder.indexOf(a[0]) - monthsOrder.indexOf(b[0])
                );
                const maxInYear = Math.max(...Object.values(months));
                return { year, months: monthEntries, maxInYear };
            });

        return {
            total, high, medium, low, pastDue, avgScore, compliance, sortedKeywords, 
            monthlyVolume: sortedYears,
            activeTotal: high + medium + low,
            readRatios: {
                high: high > 0 ? (emails.filter(e => e.urgency_label === 'High' && !e.isUnread).length / high) * 100 : 0,
                medium: medium > 0 ? (emails.filter(e => e.urgency_label === 'Medium' && !e.isUnread).length / medium) * 100 : 0,
                low: low > 0 ? (emails.filter(e => e.urgency_label === 'Low' && !e.isUnread).length / low) * 100 : 0,
            }
        };
    }, [emails]);

    const handleLogout = async () => {
        setIsLoggingOut(true); // Set loading state
        try {
            await logout();
            window.location.href = '/';
        } catch (err) {
            window.location.href = '/';
        }
    };

    if (loading || isLoggingOut) {
        return (
            <div className="min-h-screen bg-white flex flex-col items-center justify-center">
                <div className="w-12 h-12 border-4 border-slate-100 border-t-[#2E2996] rounded-full animate-spin mb-4" />
                <p className="text-slate-400 font-bold text-xs uppercase tracking-widest text-center px-4">
                    {isLoggingOut ? 'Logging out...' : (isWarmingUp ? 'AI Scoring Engine is warming up...' : 'Generating Reports...')}
                </p>
            </div>
        );
    }

    return (
        <div className="h-screen max-h-screen bg-[#F8F9FF] flex flex-col font-sans text-slate-900 overflow-hidden">
            <header className="h-16 md:h-20 bg-white border-b border-slate-100 flex items-center px-4 md:px-8 lg:px-10 justify-between sticky top-0 z-20 shrink-0 gap-4">
                <div className="flex items-center gap-4 md:gap-12 shrink-0">
                    <Logo size="sm" showText={true} />
                    
                    {/* Desktop Navigation */}
                    <nav className="hidden lg:flex gap-6 md:gap-8 text-xs font-bold uppercase tracking-widest">
                        <Link href="/dashboard" className="text-slate-400 hover:text-slate-600 transition-colors">Inbox</Link>
                        <Link href="/timeline" className="text-slate-400 hover:text-slate-600 transition-colors">Timeline</Link>
                        <Link href="/log-reports" className="text-[#2E2996] border-b-2 border-[#2E2996] pb-1">Log Reports</Link>
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
                                <Link href="/timeline" className="block px-6 py-2.5 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-[#2E2996] hover:bg-slate-50">Timeline</Link>
                                <Link href="/log-reports" className="block px-6 py-2.5 text-[11px] font-black uppercase tracking-widest text-[#2E2996] bg-indigo-50/50">Log Reports</Link>
                            </div>
                        )}
                    </div>

                    <Link href="/settings" className="lg:hidden mr-1 text-slate-400 hover:text-slate-600">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    </Link>

                    <button 
                        onClick={() => fetchData()}
                        disabled={loading}
                        className="p-2 text-slate-400 hover:text-[#2E2996] hover:bg-slate-50 rounded-lg transition-all mr-2"
                        title="Refresh Logs"
                    >
                        <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357-2H15"></path>
                        </svg>
                    </button>

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
                                <p className="text-sm font-bold text-slate-800 truncate">{userProfile?.name || 'Guest User'}</p>
                                <p className="text-xs text-slate-400 truncate mt-0.5">{userProfile?.email || ''}</p>
                            </div>
                            <button 
                                onClick={handleLogout}
                                className="w-full text-left px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
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

            <main className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12">
                <div className="max-w-7xl mx-auto space-y-8">
                    {/* Header Section */}
                    <div>
                        <span className="text-[#2E2996] text-xs font-black tracking-[0.2em] uppercase">System Analytics</span>
                        <h1 className="text-4xl font-extrabold text-[#1A1A1A] mt-2 leading-tight">Logs & Reports</h1>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* 1. Performance & Distribution Log */}
                        <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 space-y-6">
                            <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                                <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center text-[#2E2996]">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                                </div>
                                <h2 className="text-sm font-black uppercase tracking-widest text-slate-800">Performance & Distribution</h2>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <div className="flex justify-between text-xs font-black uppercase tracking-widest mb-3">
                                        <span className="text-slate-400">Avg. Urgency Score</span>
                                        <span className="text-[#2E2996]">{Math.round(stats?.avgScore || 0)}%</span>
                                    </div>
                                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-[#2E2996] transition-all duration-1000" style={{ width: `${stats?.avgScore || 0}%` }}></div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 pt-2">
                                    <div className="bg-slate-50 p-5 rounded-2xl">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">High Urgency</p>
                                        <p className="text-2xl font-black text-red-600">{stats?.high || 0}</p>
                                    </div>
                                    <div className="bg-slate-50 p-5 rounded-2xl">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Past Due</p>
                                        <p className="text-2xl font-black text-slate-800">{stats?.pastDue || 0}</p>
                                    </div>
                                </div>
                                
                                <div className="pt-2">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Urgency Breakdown (Active)</p>
                                    <div className="flex h-4 rounded-full overflow-hidden bg-slate-100">
                                        <div className="bg-red-500 transition-all duration-1000" style={{ width: `${(stats && stats.activeTotal > 0 ? (stats.high / stats.activeTotal) : 0) * 100}%` }}></div>
                                        <div className="bg-yellow-400 transition-all duration-1000" style={{ width: `${(stats && stats.activeTotal > 0 ? (stats.medium / stats.activeTotal) : 0) * 100}%` }}></div>
                                        <div className="bg-emerald-400 transition-all duration-1000" style={{ width: `${(stats && stats.activeTotal > 0 ? (stats.low / stats.activeTotal) : 0) * 100}%` }}></div>
                                    </div>
                                    <div className="flex gap-6 mt-4">
                                        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-red-500"></div><span className="text-[10px] font-black uppercase text-slate-400">High</span></div>
                                        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-yellow-400"></div><span className="text-[10px] font-black uppercase text-slate-400">Med</span></div>
                                        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div><span className="text-[10px] font-black uppercase text-slate-400">Low</span></div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* 2. User Activity & Interaction Log */}
                        <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 space-y-8 flex flex-col">
                            <div>
                                <div className="flex justify-between items-center mb-6">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Monthly Email Volume</p>
                                    
                                    {/* Year Tabs */}
                                    <div className="flex bg-slate-50 p-1 rounded-lg gap-1 border border-slate-100">
                                        {stats?.monthlyVolume.map((yearGroup: any) => (
                                            <button
                                                key={yearGroup.year}
                                                onClick={() => setActiveYear(yearGroup.year)}
                                                className={`px-3 py-1 text-[10px] font-black rounded-md transition-all ${
                                                    activeYear === yearGroup.year 
                                                        ? 'bg-white text-[#2E2996] shadow-sm ring-1 ring-slate-100' 
                                                        : 'text-slate-400 hover:text-slate-600'
                                                }`}
                                            >
                                                {yearGroup.year}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="h-48 flex items-end justify-between gap-1 px-2 mb-2">
                                    {activeYear && stats?.monthlyVolume.find((y: any) => y.year === activeYear)?.months.map(([month, count]: [string, number]) => {
                                        const yearData = stats?.monthlyVolume.find((y: any) => y.year === activeYear);
                                        const maxInYear = yearData?.maxInYear || 0;
                                        const percentage = maxInYear > 0 ? (count / maxInYear) * 100 : 0;
                                        return (
                                            <div key={month} className="flex-1 flex flex-col items-center gap-2 group relative">
                                                {/* Tooltip */}
                                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#1A1A1A] text-white text-[9px] font-black px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                                                    {count} Emails
                                                </div>
                                                
                                                <div className="w-full bg-slate-50 rounded-t-lg relative overflow-hidden flex items-end h-[140px]">
                                                    <div 
                                                        className="w-full bg-indigo-100 group-hover:bg-[#2E2996] transition-all duration-700 rounded-t-sm"
                                                        style={{ height: `${percentage}%` }}
                                                    ></div>
                                                </div>
                                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{month}</span>
                                            </div>
                                        );
                                    })}
                                </div>

                                {(!stats?.monthlyVolume || stats?.monthlyVolume.length === 0) && (
                                    <div className="h-48 flex items-center justify-center border-2 border-dashed border-slate-50 rounded-2xl">
                                        <p className="text-xs text-slate-400 italic">No email data available.</p>
                                    </div>
                                )}
                            </div>

                            <div className="pt-8 border-t border-slate-50 mt-auto">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><polyline points="17 11 19 13 23 9"></polyline></svg>
                                    </div>
                                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-800">User Activity & Compliance</h2>
                                </div>

                                <div className="space-y-8">
                                    <div className="text-center py-6 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-2">Prioritization Compliance</p>
                                        <p className="text-5xl font-black text-[#2E2996]">{Math.round(stats?.compliance || 0)}%</p>
                                        <p className="text-xs text-indigo-400 mt-3 font-semibold px-4">Rate of urgent tasks addressed by user</p>
                                    </div>

                                    <div className="space-y-5">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Read Ratio by Priority</p>
                                        <div className="space-y-4">
                                            {[
                                                { label: 'High Priority', val: stats?.readRatios.high, color: 'bg-red-500' },
                                                { label: 'Medium Priority', val: stats?.readRatios.medium, color: 'bg-yellow-400' },
                                                { label: 'Low Priority', val: stats?.readRatios.low, color: 'bg-emerald-400' }
                                            ].map(item => (
                                                <div key={item.label}>
                                                    <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-2">
                                                        <span>{item.label}</span>
                                                        <span>{Math.round(item.val || 0)}%</span>
                                                    </div>
                                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className={`h-full ${item.color} transition-all duration-1000`} style={{ width: `${item.val || 0}%` }}></div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* 3. System Logic Audit Log */}
                        <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 space-y-6">
                            <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                                <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                                </div>
                                <h2 className="text-sm font-black uppercase tracking-widest text-slate-800">System Logic Audit</h2>
                            </div>

                            <div className="space-y-8">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Top Escalation Keywords</p>
                                    <div className="space-y-3">
                                        {stats?.sortedKeywords.map(([kw, count]) => (
                                            <div key={kw} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                                                <span className="text-xs font-bold text-slate-700 capitalize">{kw}</span>
                                                <span className="text-xs font-black text-[#2E2996] bg-indigo-50 px-2.5 py-1 rounded-md">{count} hits</span>
                                            </div>
                                        ))}
                                        {(!stats?.sortedKeywords.length) && (
                                            <p className="text-xs text-slate-400 italic">No keywords detected in current batch.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </main>
        </div>
    );
}
