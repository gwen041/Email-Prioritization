'use client';

import React from 'react';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { getAuthUrl } from '@/lib/api';

export default function LoginPage() {
  const handleGoogleLogin = async () => {
    try {
      const { url } = await getAuthUrl();
      window.location.href = url;
    } catch (err: any) {
      console.error(err);
      alert('Failed to connect to Gmail: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row font-sans text-slate-900 bg-white">
      {/* Left Panel: Branding & Features */}
      <div className="lg:w-[45%] xl:w-[40%] bg-[#3C2DBE] p-8 md:p-12 lg:p-16 xl:p-20 flex flex-col justify-between text-white relative overflow-hidden shrink-0 lg:min-h-screen">
        {/* Abstract Background Detail */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -mr-24 -mt-24 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-400/10 rounded-full -ml-32 -mb-32 blur-3xl" />

        <div className="relative z-10">
          <Logo size="sm" light={true} className="mb-6 md:mb-8" />
          
          <h1 className="text-3xl lg:text-4xl xl:text-5xl font-serif leading-tight mb-4 max-w-lg">
            The swiftest way to sift your priorities.
          </h1>
          
          <p className="text-sm lg:text-base text-indigo-100 leading-relaxed mb-6 xl:mb-8 max-w-md font-medium">
            Siftly turns inbox clutter into a prioritized roadmap — ranking emails by urgency and authority so you can focus on the work that actually matters.
          </p>

          <div className="space-y-4 xl:space-y-6">
            <div className="flex gap-5">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center shrink-0 border border-white/5 shadow-inner">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <div>
                <h3 className="font-bold text-white text-lg mb-1">Real-time deadline detection</h3>
                <p className="text-indigo-200 text-sm">Surfaces time-sensitive threads the moment they land.</p>
              </div>
            </div>

            <div className="flex gap-5">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center shrink-0 border border-white/5 shadow-inner">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              </div>
              <div>
                <h3 className="font-bold text-white text-lg mb-1">NLP-powered priority scoring</h3>
                <p className="text-indigo-200 text-sm">Reads tone, intent and authority — not just keywords.</p>
              </div>
            </div>

            <div className="flex gap-5">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center shrink-0 border border-white/5 shadow-inner">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
              </div>
              <div>
                <h3 className="font-bold text-white text-lg mb-1">Fully customizable weights</h3>
                <p className="text-indigo-200 text-sm">Tune the ranking model to match how you actually work.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 pt-4 mt-6 border-t border-white/10">
          <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest">
            © 2026 Siftly · Built for focused inboxes
          </p>
        </div>
      </div>

      {/* Right Panel: Login Form */}
      <div className="flex-1 bg-white flex items-center justify-center p-8 lg:p-12 relative overflow-y-auto min-h-full">
        {/* Subtle background detail */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: `radial-gradient(#3C2DBE 1px, transparent 1px)`, backgroundSize: '48px 48px' }} />

        <main className="w-full max-w-md z-10 animate-fade-in py-4">
          <div className="bg-white p-6 md:p-10 lg:p-12 rounded-[2.5rem] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.12)] border border-slate-50 flex flex-col items-center">
            
            <span className="text-[9px] font-black tracking-[0.4em] text-slate-300 mb-2 uppercase">Get Started</span>
            
            <h2 className="text-2xl md:text-3xl xl:text-4xl font-serif text-[#1A1A1A] mb-2 text-center tracking-tight">
              Welcome to Siftly
            </h2>
            
            <p className="text-slate-400 text-center mb-8 text-sm leading-relaxed w-full">
              Connect your Gmail to start prioritizing your emails.
            </p>

            <button
              onClick={handleGoogleLogin}
              className="w-full bg-[#1F1D62] text-white h-16 rounded-xl font-bold flex items-center justify-center gap-4 hover:bg-[#151347] transition-all shadow-xl hover:shadow-indigo-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] group"
            >
              <div className="bg-white p-1 rounded-md shadow-sm group-hover:scale-110 transition-transform">
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              </div>
              Sign in with Google
            </button>

            <div className="mt-8 pt-6 border-t border-slate-100 text-center w-full">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                By signing in, you authorize Siftly to read your Gmail inbox.<br/>
                Your data is <span className="text-slate-600 font-black">never stored externally</span>.
              </p>
              <div className="mt-4">
                <Link href="/privacy" className="text-[11px] text-indigo-600 font-bold hover:underline">Privacy Policy</Link>
                <span className="mx-2 text-slate-300">•</span>
                <Link href="/terms" className="text-[11px] text-indigo-600 font-bold hover:underline">Terms of Service</Link>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

