'use client';
import { useState, useEffect } from 'react';
import { getSettings, saveSettings, deleteUserAccount } from '@/lib/api';
import Link from 'next/link';

interface SettingsData {
    weights: Record<string, number>;
    important_senders: string[];
}

export default function Settings() {
    const [settings, setSettings] = useState<SettingsData | null>(null);
    const [newSender, setNewSender] = useState('');
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

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

    const handleDeleteData = async () => {
        setIsDeleting(true);
        try {
            await deleteUserAccount();
            setIsLoggingOut(true);
            alert('Your account and all associated data have been permanently deleted. You will now be logged out.');
            window.location.href = '/';
        } catch (err) {
            console.error('Failed to delete account:', err);
            alert('Failed to delete account. Please try again later.');
            setIsDeleting(false);
        }
    };

    if (isLoggingOut) return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center">
            <div className="w-12 h-12 border-4 border-slate-100 border-t-[#2E2996] rounded-full animate-spin mb-4" />
            <p className="text-slate-400 font-bold text-xs uppercase tracking-widest text-center px-4">Logging out...</p>
        </div>
    );

    if (!settings) return <div className="flex items-center justify-center min-h-screen bg-white text-slate-500 font-medium">Loading settings...</div>;

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
        <div className="min-h-screen bg-white font-sans text-slate-900">
            <div className="py-10 px-6 sm:px-12 max-w-7xl mx-auto flex flex-col min-h-screen">
                <header className="mb-8 shrink-0">
                    <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Priority Settings</h1>
                    <p className="mt-2 text-slate-500 text-lg">Customize how your emails are ranked.</p>
                </header>

                <div className="flex-1 overflow-y-auto w-full py-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 w-full">
                        {/* Weights Section */}
                        <section className="bg-white p-6 md:p-8 rounded-2xl border border-slate-100 flex flex-col justify-center min-w-0 shadow-sm">
                            <h2 className="text-xl font-bold text-slate-800 mb-6 shrink-0">
                                Weight Distribution
                            </h2>
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
                                            className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                        />
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Important Senders Section */}
                        <section className="bg-white p-6 md:p-8 rounded-2xl border border-slate-100 flex flex-col min-w-0 shadow-sm">
                            <h2 className="text-xl font-bold text-slate-800 mb-2 shrink-0">
                                Important Senders
                            </h2>
                            <p className="text-slate-500 mb-6 text-sm shrink-0">These senders will always receive the maximum authority score.</p>
                            
                            <form onSubmit={handleAddSender} className="flex flex-col sm:flex-row gap-2 mb-6 shrink-0">
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

                            <div className="flex flex-wrap gap-2 content-start min-w-0">
                                {settings.important_senders.length === 0 && (
                                    <span className="text-slate-400 italic text-sm">No important senders added yet.</span>
                                )}
                                {settings.important_senders.map((sender: string) => (
                                    <div key={sender} className="flex items-center bg-slate-50 text-slate-700 px-3 py-1.5 rounded-full text-sm font-medium border border-slate-200 group h-8 max-w-full">
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

                    {/* Danger Zone Section */}
                    <section className="mt-12 pt-8 border-t border-red-100 bg-red-50/20 p-8 rounded-2xl border-dashed border-2">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                            <div>
                                <h2 className="text-xl font-bold text-red-800 flex items-center gap-2">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                    </svg>
                                    Danger Zone
                                </h2>
                                <p className="text-red-600/70 text-sm mt-1 max-w-xl font-medium">
                                    This will permanently delete your account, all personal settings, and email analysis history. This action cannot be undone.
                                </p>
                                </div>

                                {!showDeleteConfirm ? (
                                <button 
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="px-6 py-2.5 bg-red-50 text-red-700 font-bold text-[10px] uppercase tracking-widest rounded-lg hover:bg-red-100 transition-colors border border-red-100"
                                >
                                    Delete My Account
                                </button>
                                ) : (
                                <div className="flex items-center gap-3">
                                    <button 
                                        onClick={() => setShowDeleteConfirm(false)}
                                        className="px-4 py-2 text-slate-500 font-bold text-[10px] uppercase tracking-widest hover:text-slate-700"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={handleDeleteData}
                                        disabled={isDeleting}
                                        className="px-6 py-2.5 bg-red-600 text-white font-bold text-[10px] uppercase tracking-widest rounded-lg hover:bg-red-700 transition-all shadow-md flex items-center gap-2"
                                    >
                                        {isDeleting ? 'Deleting...' : 'Confirm Permanent Account Deletion'}
                                    </button>
                                </div>
                                )}                        </div>
                    </section>
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
        </div>
    );
}
