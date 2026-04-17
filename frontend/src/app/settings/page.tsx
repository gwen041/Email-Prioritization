'use client';
import { useState, useEffect } from 'react';
import { getSettings, saveSettings } from '@/lib/api';
import Link from 'next/link';

interface SettingsData {
    weights: Record<string, number>;
    important_senders: string[];
}

export default function Settings() {
    const [settings, setSettings] = useState<SettingsData | null>(null);
    const [newSender, setNewSender] = useState('');
    const [saveSuccess, setSaveSuccess] = useState(false);

    useEffect(() => {
        getSettings().then(setSettings);
    }, []);

    const handleWeightChange = (key: string, value: number) => {
        if (!settings) return;
        const newSettings = { ...settings };
        newSettings.weights[key] = value;
        setSettings(newSettings);
    };

    const handleAddSender = (e: React.FormEvent) => {
        e.preventDefault();
        if (!settings) return;
        if (newSender && !settings.important_senders.includes(newSender)) {
            const newSettings = { ...settings };
            newSettings.important_senders = [...newSettings.important_senders, newSender];
            setSettings(newSettings);
            setNewSender('');
        }
    };

    const handleRemoveSender = (sender: string) => {
        if (!settings) return;
        const newSettings = { ...settings };
        newSettings.important_senders = newSettings.important_senders.filter((s: string) => s !== sender);
        setSettings(newSettings);
    };

    const handleSave = async () => {
        if (!settings) return;
        await saveSettings(settings);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
    };

    if (!settings) return <div className="flex items-center justify-center min-h-screen text-slate-500 font-medium">Loading settings...</div>;

    const weightLabels: Record<string, string> = {
        deadline_weight: "Deadline Proximity",
        sender_weight: "Sender Authority",
        task_weight: "Task Complexity",
        escalation_weight: "Escalation Keywords"
    };

    const weightMaxes: Record<string, number> = {
        deadline_weight: 40,
        sender_weight: 30,
        task_weight: 20,
        escalation_weight: 10
    };

    return (
        <div className="h-screen py-10 px-6 sm:px-12 max-w-7xl mx-auto flex flex-col">
            <header className="mb-8 shrink-0">
                <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Priority Settings</h1>
                <p className="mt-2 text-slate-500 text-lg">Customize how your emails are ranked.</p>
            </header>

            <div className="flex-1 overflow-hidden flex flex-col justify-center w-full">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 h-[450px] w-full">
                    {/* Weights Section */}
                    <section className="bg-slate-50 p-8 rounded-2xl border border-slate-100 flex flex-col justify-center h-full min-w-0">
                        <div className="grid gap-6">
                            {Object.entries(settings.weights).map(([key, value]) => (
                                <div key={key}>
                                    <div className="flex justify-between items-center mb-3">
                                        <span className="font-semibold text-slate-700">{weightLabels[key]}</span>
                                        <span className="font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md text-sm">
                                            {(value as number)} / {weightMaxes[key] || 100}
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max={weightMaxes[key] || 100}
                                        value={value as number}
                                        onChange={(e) => handleWeightChange(key, parseInt(e.target.value))}
                                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                    />
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Important Senders Section */}
                    <section className="bg-slate-50 p-8 rounded-2xl border border-slate-100 flex flex-col h-full overflow-hidden min-w-0">
                        <h2 className="text-xl font-bold text-slate-800 mb-2 shrink-0">
                            Important Senders
                        </h2>
                        <p className="text-slate-500 mb-6 text-sm shrink-0">These senders will always receive the maximum authority score.</p>
                        
                        <form onSubmit={handleAddSender} className="flex gap-2 mb-6 shrink-0">
                            <input
                                type="text"
                                placeholder="Enter email or name segment..."
                                value={newSender}
                                onChange={(e) => setNewSender(e.target.value)}
                                className="flex-1 px-4 py-2 border border-slate-300 shadow-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-700 placeholder-slate-400"
                            />
                            <button
                                type="submit"
                                className="px-6 py-2 bg-slate-800 text-white font-semibold rounded-lg hover:bg-slate-900 transition-colors shadow-sm"
                            >
                                Add
                            </button>
                        </form>

                        <div className="flex flex-wrap gap-2 overflow-y-auto pr-2 flex-1 content-start min-w-0">
                            {settings.important_senders.length === 0 && (
                                <span className="text-slate-400 italic text-sm">No important senders added yet.</span>
                            )}
                            {settings.important_senders.map((sender: string) => (
                                <div key={sender} className="flex items-center bg-white text-slate-700 px-3 py-1.5 rounded-full text-sm font-medium border border-slate-200 group h-8 max-w-full">
                                    <span className="truncate min-w-0 flex-1">{sender}</span>
                                    <button
                                        onClick={() => handleRemoveSender(sender)}
                                        className="ml-2 text-slate-400 hover:text-red-500 focus:outline-none shrink-0"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </div>

            <div className="flex justify-between items-center pt-6 mt-6 border-t border-slate-200 shrink-0">
                <Link href="/dashboard" className="text-slate-500 hover:text-slate-900 font-medium transition-colors text-sm flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" />
                    </svg>
                    Back to Inbox
                </Link>
                <div className="flex items-center gap-4">
                    {saveSuccess && (
                        <span className="text-green-600 font-medium text-sm flex items-center transition-opacity duration-300">
                            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                            </svg>
                            Saved successfully!
                        </span>
                    )}
                    <button
                        onClick={handleSave}
                        className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                    >
                        Save Settings
                    </button>
                </div>
            </div>
        </div>
    );
}
