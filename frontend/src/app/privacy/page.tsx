import Link from 'next/link';
import Logo from '@/components/Logo';

export default function PrivacyPolicy() {
    return (
        <div className="min-h-screen bg-[#F8F9FF] font-sans text-slate-900 py-12 px-4 md:px-8">
            <div className="max-w-3xl mx-auto bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-8 md:p-12 border-b border-slate-50 flex justify-between items-center">
                    <Logo size="sm" showText={true} />
                    <Link href="/login" className="text-[10px] font-black uppercase tracking-widest text-[#2E2996] hover:underline">
                        Back to Login
                    </Link>
                </div>
                
                <div className="p-8 md:p-12 prose prose-slate max-w-none">
                    <h1 className="text-3xl font-black text-slate-800 mb-8">Privacy Policy</h1>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-8 text-right">Last Updated: May 12, 2026</p>

                    <section className="mb-8">
                        <h2 className="text-sm font-black uppercase tracking-widest text-[#2E2996] mb-4">1. Information We Collect</h2>
                        <p className="text-sm leading-relaxed text-slate-600">
                            Siftly connects to your Gmail account using Google OAuth2. We only request access to the following information:
                        </p>
                        <ul className="list-disc pl-5 mt-2 text-sm text-slate-600 space-y-1">
                            <li><strong>Gmail Data:</strong> We access your email headers (sender, date, subject) and message body to analyze urgency and importance.</li>
                            <li><strong>Google Profile Information:</strong> We access your email address and profile picture to personalize your dashboard.</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-sm font-black uppercase tracking-widest text-[#2E2996] mb-4">2. How We Use Your Data</h2>
                        <p className="text-sm leading-relaxed text-slate-600">
                            The data collected is used exclusively to provide Siftly’s core functionality:
                        </p>
                        <ul className="list-disc pl-5 mt-2 text-sm text-slate-600 space-y-1">
                            <li><strong>Email Prioritization:</strong> Our system uses Natural Language Processing (NLP) to calculate an &quot;Urgency Score&quot; based on deadlines, sender authority, and task complexity.</li>
                            <li><strong>Dashboard Display:</strong> To display your prioritized inbox and generate reports on your email volume.</li>
                        </ul>
                    </section>

                    <section className="mb-8 bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100">
                        <h2 className="text-sm font-black uppercase tracking-widest text-[#2E2996] mb-4">3. Google Data Disclosure (Limited Use)</h2>
                        <p className="text-sm leading-relaxed text-slate-600">
                            Siftly&apos;s use and transfer of information received from Google APIs to any other app will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-indigo-600 underline" target="_blank" rel="noopener noreferrer">Google API Service User Data Policy</a>, including the Limited Use requirements.
                        </p>
                        <ul className="list-disc pl-5 mt-2 text-sm text-slate-600 space-y-1">
                            <li>We <strong>do not</strong> sell your Gmail data to third parties.</li>
                            <li>We <strong>do not</strong> use your Gmail data for serving advertisements.</li>
                            <li>We <strong>do not</strong> use your Gmail data for any purpose other than providing and improving the email prioritization features of Siftly.</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-sm font-black uppercase tracking-widest text-[#2E2996] mb-4">4. Data Storage and Security</h2>
                        <p className="text-sm leading-relaxed text-slate-600">
                            Siftly is designed with a &quot;Privacy First&quot; approach. The majority of email processing occurs within our secure backend and local Python scoring engine.
                        </p>
                        <p className="text-sm leading-relaxed text-slate-600 mt-2">
                            We do not maintain a permanent database of your email content on our servers. All data transferred between your browser, our backend, and Google APIs is encrypted using industry-standard SSL/TLS protocols.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-sm font-black uppercase tracking-widest text-[#2E2996] mb-4">5. User Control and Data Deletion</h2>
                        <p className="text-sm leading-relaxed text-slate-600">
                            You can revoke Siftly&apos;s access to your Google account at any time via your <a href="https://myaccount.google.com/permissions" className="text-indigo-600 underline" target="_blank" rel="noopener noreferrer">Google Security Settings</a>. Within the Siftly app, you may also use the &quot;Delete Account&quot; feature in the Settings menu to wipe any locally cached preferences or tokens.
                        </p>
                    </section>
                </div>

                <div className="p-8 md:p-12 bg-slate-50 border-t border-slate-100 text-center">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                        &copy; 2026 Siftly AI. All Rights Reserved.
                    </p>
                </div>
            </div>
        </div>
    );
}
