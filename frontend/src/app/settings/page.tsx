'use client';
import { useState, useEffect } from 'react';
import { getSettings, saveSettings } from '@/lib/api';
import Link from 'next/link';

export default function Settings() {
    const [settings, setSettings] = useState<any>(null);
    const [newSender, setNewSender] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        getSettings().then(setSettings);
    }, []);

    const handleWeightChange = (key: string, value: number) => {
        const newSettings = { ...settings };
        newSettings.weights[key] = value;
        setSettings(newSettings);
        
        // Calculate total
        const total = Object.values(newSettings.weights).reduce((a: any, b: any) => a + b, 0) as number;
        if (total !== 100) {
            setError(`Total weight must be 100%. Current: ${total}%`);
        } else {
            setError(null);
        }
    };

    const handleAddSender = (e: React.FormEvent) => {
        e.preventDefault();
        if (newSender && !settings.important_senders.includes(newSender)) {
            const newSettings = { ...settings };
            newSettings.important_senders.push(newSender);
            setSettings(newSettings);
            setNewSender('');
        }
    };

    const handleRemoveSender = (sender: string) => {
        const newSettings = { ...settings };
        newSettings.important_senders = newSettings.important_senders.filter((s: string) => s !== sender);
        setSettings(newSettings);
    };

    const handleSave = async () => {
        const total = Object.values(settings.weights).reduce((a: any, b: any) => a + b, 0) as number;
        if (total !== 100) {
            alert(`Cannot save: Total weight must be exactly 100%. Current: ${total}%`);
            return;
        }
        await saveSettings(settings);
        alert('Settings saved successfully!');
    };

    if (!settings) return <div className="flex items-center justify-center min-h-screen bg-slate-50 text-slate-500 font-medium">Loading settings...</div>;

    const weightLabels: Record<string, string> = {
        deadline_weight: "Deadline Proximity (%)",
        sender_weight: "Sender Authority (%)",
        task_weight: "Task Complexity (%)",
        escalation_weight: "Escalation Keywords (%)"
    };

    return (
        <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
                <div className="bg-white shadow-2xl rounded-3xl overflow-hidden border border-slate-100">
                    <header className="px-8 py-10 bg-gradient-to-r from-blue-600 to-indigo-700 text-white text-center">
                        <h1 className="text-4xl font-extrabold tracking-tight">Priority Algorithm Settings</h1>
                        <p className="mt-3 text-blue-100 text-lg">Fine-tune how your emails are prioritized.</p>
                    </header>

                    <div className="p-8 space-y-12">
                        {/* Weights Section */}
                        <section>
                            <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center">
                                <span className="bg-blue-100 text-blue-600 p-2 rounded-lg mr-3">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                                    </svg>
                                </span>
                                Factor Contribution Weights
                            </h2>
                            
                            <div className="grid gap-6">
                                {Object.entries(settings.weights).map(([key, value]) => (
                                    <div key={key} className="p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-200 transition-colors">
                                        <div className="flex justify-between items-center mb-3">
                                            <span className="font-semibold text-slate-700">{weightLabels[key]}</span>
                                            <span className="text-xl font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-xl">{value}%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={value as number}
                                            onChange={(e) => handleWeightChange(key, parseInt(e.target.value))}
                                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                        />
                                    </div>
                                ))}
                            </div>
                            
                            {error && (
                                <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-xl flex items-center font-medium animate-pulse">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                    {error}
                                </div>
                            )}
                        </section>

                        <hr className="border-slate-100" />

                        {/* Important Senders Section */}
                        <section>
                            <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center">
                                <span className="bg-indigo-100 text-indigo-600 p-2 rounded-lg mr-3">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                    </svg>
                                </span>
                                Important Senders
                            </h2>
                            <p className="text-slate-500 mb-6">These senders will always receive the maximum authority score (High Authority).</p>
                            
                            <form onSubmit={handleAddSender} className="flex gap-2 mb-6">
                                <input
                                    type="text"
                                    placeholder="Enter email or name segment..."
                                    value={newSender}
                                    onChange={(e) => setNewSender(e.target.value)}
                                    className="flex-1 px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                />
                                <button
                                    type="submit"
                                    className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100"
                                >
                                    Add
                                </button>
                            </form>

                            <div className="flex flex-wrap gap-3">
                                {settings.important_senders.length === 0 && (
                                    <span className="text-slate-400 italic">No important senders added yet.</span>
                                )}
                                {settings.important_senders.map((sender: string) => (
                                    <div key={sender} className="flex items-center bg-indigo-50 text-indigo-700 px-4 py-2 rounded-full font-semibold border border-indigo-100 group hover:border-indigo-300 transition-all">
                                        {sender}
                                        <button
                                            onClick={() => handleRemoveSender(sender)}
                                            className="ml-3 text-indigo-400 hover:text-indigo-600 focus:outline-none"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <div className="flex justify-between items-center pt-8 border-t border-slate-100">
                            <Link href="/dashboard" className="flex items-center text-slate-500 hover:text-blue-600 font-bold transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" />
                                </svg>
                                Back to Inbox
                            </Link>
                            <button
                                onClick={handleSave}
                                disabled={!!error}
                                className={`px-10 py-4 font-bold rounded-2xl shadow-xl transition-all active:scale-95 ${
                                    error 
                                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed' 
                                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-blue-200 hover:-translate-y-1'
                                }`}
                            >
                                Save Configuration
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
