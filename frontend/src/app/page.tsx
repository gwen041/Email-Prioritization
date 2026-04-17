'use client';

import React from 'react';
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
    <div className="min-h-screen w-full flex overflow-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── Left Panel: Branding ── */}
      <div className="hidden lg:flex w-1/2 flex-col justify-between p-14 relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #1a147a 0%, #2E2996 55%, #4338ca 100%)' }}>

        {/* Decorative blobs */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #818cf8, transparent)' }} />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #a5b4fc, transparent)' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full opacity-5"
          style={{ background: 'radial-gradient(circle, white, transparent)' }} />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 bg-white bg-opacity-15 rounded-xl flex items-center justify-center backdrop-blur-sm border border-white border-opacity-20">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M22 3H2L10 12.46V19L14 21V12.46L22 3Z" />
            </svg>
          </div>
          <span className="text-white font-black text-xl tracking-tight">Siftly</span>
        </div>

        {/* Center pitch */}
        <div className="relative z-10 space-y-8">
          <div>
            <h1 className="text-5xl font-black text-white leading-tight tracking-tight mb-4">
              Your inbox,<br />
              <span style={{ color: '#a5b4fc' }}>intelligently</span><br />
              ordered.
            </h1>
            <p className="text-indigo-200 text-lg leading-relaxed max-w-md">
              Siftly uses AI to analyze your emails and rank them by deadline urgency, sender authority, and task complexity — so you always act on what matters most.
            </p>
          </div>

          {/* Feature pills */}
          <div className="flex flex-col gap-3">
            {[
              { icon: '⏱', label: 'Real-time deadline detection' },
              { icon: '🧠', label: 'NLP-powered priority scoring' },
              { icon: '📊', label: 'Fully customizable weight settings' },
            ].map(f => (
              <div key={f.label} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white bg-opacity-10 flex items-center justify-center text-sm border border-white border-opacity-10">
                  {f.icon}
                </div>
                <span className="text-indigo-100 text-sm font-medium">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom tagline */}
        <div className="relative z-10">
          <p className="text-indigo-300 text-xs tracking-widest uppercase font-bold">
            Email Prioritization System &mdash; v2.0
          </p>
        </div>
      </div>

      {/* ── Right Panel: Login Form ── */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50">

        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#2E2996' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M22 3H2L10 12.46V19L14 21V12.46L22 3Z" />
            </svg>
          </div>
          <span className="font-black text-xl tracking-tight text-slate-800">Siftly</span>
        </div>

        <div className="w-full max-w-md">
          {/* Heading */}
          <div className="mb-10">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Welcome back</h2>
            <p className="text-slate-500 text-sm">Connect your Gmail to start prioritizing your emails with AI.</p>
          </div>

          {/* Google Sign-in button */}
          <button
            onClick={handleGoogleLogin}
            id="google-signin-btn"
            className="w-full h-14 rounded-xl font-bold text-white flex items-center justify-center gap-3 transition-all duration-200 shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
            style={{ background: 'linear-gradient(135deg, #2E2996 0%, #4338ca 100%)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="white" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="white" fillOpacity="0.8" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="white" fillOpacity="0.8" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="white" fillOpacity="0.8" />
            </svg>
            Sign in with Google
          </button>

          {/* Privacy note */}
          <p className="text-center text-xs text-slate-400 mt-6 leading-relaxed">
            By signing in, you authorize Siftly to read your Gmail inbox.<br />
            Your data is never stored externally.
          </p>

          {/* Divider with stats */}
          <div className="mt-12 pt-8 border-t border-slate-200 grid grid-cols-3 gap-4 text-center">
            {[
              { value: 'NLP', label: 'Deadline Engine' },
              { value: 'AI', label: 'Priority Ranking' },
              { value: '100%', label: 'Private & Local' },
            ].map(s => (
              <div key={s.label}>
                <div className="text-xl font-black text-slate-800">{s.value}</div>
                <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
