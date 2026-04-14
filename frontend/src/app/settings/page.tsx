'use client';
import { useState, useEffect } from 'react';
import { getSettings, saveSettings } from '@/lib/api';
import Link from 'next/link';

export default function Settings() {
    const [settings, setSettings] = useState<any>(null);

    useEffect(() => {
        getSettings().then(setSettings);
    }, []);

    const handleChange = (id: string, value: number) => {
        const newSettings = { ...settings };
        const index = newSettings.factors.findIndex((f: any) => f.id === id);
        newSettings.factors[index].weight = value;
        setSettings(newSettings);
    };

    const handleSave = async () => {
        await saveSettings(settings);
        alert('Settings saved!');
    };

    if (!settings) return <div className="p-10">Loading settings...</div>;

    return (
        <div className="max-w-2xl mx-auto p-10 bg-white shadow-2xl rounded-3xl mt-12 border border-blue-50">
            <header className="mb-10 text-center">
                <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                    Priority Algorithm Settings
                </h1>
                <p className="text-slate-500 mt-2">Adjust factor weights to recalibrate your inbox rankings.</p>
            </header>

            <div className="space-y-8">
                {settings.factors.map((factor: any) => (
                    <div key={factor.id} className="p-6 bg-slate-50 rounded-2xl hover:shadow-md transition-all duration-300 border border-transparent hover:border-blue-100">
                        <div className="flex justify-between mb-3 items-center">
                            <span className="font-semibold text-slate-800 text-lg">{factor.label}</span>
                            <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-bold text-sm">
                                {factor.weight} / {factor.max || factor.weight}
                            </span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max={factor.max || 20}
                            value={factor.weight}
                            onChange={(e) => handleChange(factor.id, parseInt(e.target.value))}
                            className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                    </div>
                ))}

                <div className="flex justify-between pt-6">
                    <Link href="/" className="inline-flex items-center text-slate-500 hover:text-blue-600 font-medium transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" />
                        </svg>
                        Back to Inbox
                    </Link>
                    <button
                        onClick={handleSave}
                        className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-200 hover:scale-105 transition-transform active:scale-95"
                    >
                        Save Configuration
                    </button>
                </div>
            </div>
        </div>
    );
}
