import Link from 'next/link';
import Logo from '@/components/Logo';

export default function TermsOfService() {
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
                    <h1 className="text-3xl font-black text-slate-800 mb-8">Terms of Service</h1>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-8 text-right">Last Updated: May 14, 2026</p>

                    <section className="mb-8">
                        <h2 className="text-sm font-black uppercase tracking-widest text-[#2E2996] mb-4">1. Use of Service</h2>
                        <p className="text-sm leading-relaxed text-slate-600">
                            This Service is designed to help you organize and prioritize your email communications. You agree to use the Service only for personal, non-commercial purposes. You are responsible for any activity that occurs under your account.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-sm font-black uppercase tracking-widest text-[#2E2996] mb-4">2. Privacy and Data Security</h2>
                        <ul className="list-disc pl-5 mt-2 text-sm text-slate-600 space-y-1">
                            <li><strong>Email Access:</strong> To function, the Service requires access to your Gmail account via Google OAuth2. We request read-only access to your email metadata.</li>
                            <li><strong>Data Storage:</strong> Your email metadata, ranking scores, and settings are stored locally on our secure server.</li>
                            <li><strong>Data Deletion:</strong> You may delete your account and all associated data at any time via the "Settings" page.</li>
                        </ul>
                    </section>

                    <section className="mb-8 bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100">
                        <h2 className="text-sm font-black uppercase tracking-widest text-[#2E2996] mb-4">3. AI Scoring and Accuracy</h2>
                        <p className="text-sm leading-relaxed text-slate-600">
                            The Service uses automated AI scoring and heuristic algorithms to categorize your emails. Prioritization scores are estimates and should not be considered definitive. You are solely responsible for deciding which emails to read, prioritize, or ignore.
                        </p>
                        <p className="text-sm leading-relaxed text-slate-600 mt-2">
                            While we strive for accuracy, the Service may occasionally misclassify or fail to rank emails correctly. We do not guarantee that the Service will meet your expectations or that the analysis will be error-free.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-sm font-black uppercase tracking-widest text-[#2E2996] mb-4">4. Limitation of Liability</h2>
                        <p className="text-sm leading-relaxed text-slate-600">
                            The Service is provided "as is" and "as available." In no event shall the developers be liable for any damages arising out of your use of the Service, including but not limited to missed deadlines, lost information, or communication errors.
                        </p>
                    </section>
                </div>

                <div className="p-8 md:p-12 bg-slate-50 border-t border-slate-100 text-center">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                        &copy; 2026 Siftly. All Rights Reserved.
                    </p>
                </div>
            </div>
        </div>
    );
}
