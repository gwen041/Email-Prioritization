'use client';

import React from 'react';
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
    <>
      {/* Google Fonts — Outfit for display, DM Sans for body */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');
        .font-display { font-family: 'Outfit', sans-serif; }
        .font-body   { font-family: 'DM Sans', sans-serif; }
      `}</style>

      <div className="min-h-screen w-full flex flex-col lg:flex-row overflow-y-auto font-body">

        {/* ── Left Panel: Branding ── */}
        <div
          className="flex lg:w-1/2 flex-col justify-between p-8 lg:p-14 relative overflow-hidden border-b border-white/10 lg:border-b-0"
          style={{ background: 'linear-gradient(145deg, #1a147a 0%, #2E2996 55%, #4338ca 100%)' }}
        >
          {/* Decorative blobs */}
          <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, #818cf8, transparent)' }} />
          <div className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #a5b4fc, transparent)' }} />

          {/* Logo — white text via light prop */}
          <div className="relative z-10 mb-10 lg:mb-0">
            <Logo size="sm" light />
          </div>

          {/* Center pitch */}
          <div className="relative z-10 space-y-8 my-8 lg:my-0">
            <div>
              <h1 className="font-display text-4xl lg:text-5xl font-black text-white leading-tight tracking-tight mb-5">
                The swiftest way<br />
                to sift your<br />
                <span style={{ color: '#a5b4fc' }}>priorities.</span>
              </h1>
              <p className="text-indigo-200 text-sm lg:text-base leading-relaxed max-w-md" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400 }}>
                Siftly turns inbox clutter into a prioritized roadmap. It uses AI to rank emails by urgency and authority, automating the sifting process so you can focus on the work that actually matters.
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
                  <span className="text-indigo-100 text-sm" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>{f.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Empty bottom spacer so justify-between pushes content nicely on desktop */}
          <div className="hidden lg:block" />
        </div>

        {/* ── Right Panel: Login Form ── */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 lg:p-12 bg-slate-50 min-h-[600px] lg:min-h-0">

          {/* Mobile logo hidden because we show branding panel now */}
          <div className="hidden lg:hidden flex justify-center mb-10">
            <Logo size="sm" />
          </div>

          <div className="w-full max-w-md">
            {/* Heading — centered to align with button */}
            <div className="mb-10 text-center">
              <h2 className="font-display text-3xl font-black text-slate-900 tracking-tight mb-2">
                Welcome to Siftly
              </h2>
              <p className="text-slate-500 text-sm leading-relaxed">
                Connect your Gmail to start prioritizing your emails with AI.
              </p>
            </div>

            {/* Google Sign-in button — centered, not full-width */}
            <div className="flex justify-center">
              <button
                onClick={handleGoogleLogin}
                id="google-signin-btn"
                className="inline-flex items-center gap-3 px-8 h-14 rounded-xl font-semibold text-white transition-all duration-200 shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
                style={{
                  background: 'linear-gradient(135deg, #2E2996 0%, #4338ca 100%)',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" className="shrink-0">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="white" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="white" fillOpacity="0.8" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="white" fillOpacity="0.8" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="white" fillOpacity="0.8" />
                </svg>
                Sign in with Google
              </button>
            </div>

            {/* Privacy note */}
            <p className="text-center text-xs text-slate-400 mt-5 leading-relaxed">
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
                  <div className="font-display text-2xl font-black text-slate-800">{s.value}</div>
                  <div className="text-slate-400 text-xs tracking-wide font-medium mt-0.5"
                    style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
