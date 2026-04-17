'use client';

import React, { useState } from 'react';
import Logo from '@/components/Logo';
import Link from 'next/link';

export default function LoginPage() {

  const handleGoogleLogin = () => {
    console.log('Google login clicked');
    alert('Connecting to Google...');
  };

  const handleGoogleLogin = () => {
    console.log('Google login clicked');
    alert('Connecting to Google...');
  };

  return (
    <div className="min-h-screen relative light-gradient flex flex-col items-center justify-center p-4">
      {/* Top Header */}
      <header className="absolute top-0 left-0 right-0 p-8 flex justify-between items-center w-full max-w-7xl mx-auto">
        <Logo size="sm" className="opacity-90 grayscale hover:grayscale-0 transition-all duration-300" />
        <nav className="flex gap-8 text-[11px] font-bold tracking-[0.2em] text-slate-400">
          <Link href="#" className="hover:text-slate-600 transition-colors uppercase">Documentation</Link>
          <Link href="#" className="hover:text-slate-600 transition-colors uppercase">Support</Link>
        </nav>
      </header>

      {/* Main Login Card */}
      <main className="w-full max-w-[440px] z-10 animate-fade-in translate-y-4">
        <div className="bg-white p-12 rounded-xl login-card-shadow border border-slate-100 flex flex-col items-center">

          {/* Logo Icon Large */}
          <div className="w-16 h-16 bg-[#2E2996] rounded-lg flex items-center justify-center mb-6 shadow-sm">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
          </div>

          <h1 className="text-4xl font-black text-[#1A1A1A] tracking-tight mb-1">Siftly</h1>
          <p className="text-[10px] font-bold tracking-[0.3em] text-slate-400 mb-12 uppercase">
            Email Prioritization System
          </p>



          <div className="w-full space-y-4">
            <button
              onClick={handleGoogleLogin}
              className="w-full bg-[#2E2996] text-white h-14 rounded-lg font-bold flex items-center justify-center gap-4 hover:bg-[#252180] transition-colors shadow-sm"
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="white" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="white" fillOpacity="0.8" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="white" fillOpacity="0.8" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="white" fillOpacity="0.8" />
              </svg>
              Sign in with Google
            </button>


          </div>

          {/* Footer Card Info */}
          <div className="mt-16 flex gap-3 items-start">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2E2996" strokeWidth="2.5" className="mt-0.5 shrink-0 opacity-60">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <p className="text-[10px] leading-relaxed text-slate-400 font-medium">
              Access Restricted: Internal node connection required. Queries are logged for audit and quality assurance.
              Information processed remains ephemeral and stateless within this instance.
            </p>
          </div>
        </div>
      </main>

      {/* Visual background details - subtle grid or noise could be added here if needed */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: `radial-gradient(#2E2996 1px, transparent 1px)`, backgroundSize: '32px 32px' }}></div>
    </div>
  );
}
