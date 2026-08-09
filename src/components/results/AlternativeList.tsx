'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Layers } from 'lucide-react';
import { AlternativeModel } from '@/types';

interface AlternativeListProps {
    alternatives: AlternativeModel[];
    onSelect: (query: string) => void;
    delay?: number;
}

export const AlternativeList: React.FC<AlternativeListProps> = ({ alternatives, onSelect, delay = 0 }) => {
    return (
        <div className="pt-6 lg:pt-0 border-t lg:border-t-0 border-white/10">
            <h4 className="text-[8px] sm:text-[10px] uppercase tracking-[0.3em] font-black text-white/20 mb-4 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> Alternatives
            </h4>
            <div className="grid gap-3">
                {alternatives.map((alt, i) => (
                    <motion.button
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: delay + (i * 0.05) }}
                        onClick={() => onSelect(`${alt.brand} ${alt.model}`)}
                        className="p-4 sm:p-5 text-left rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all active:scale-[0.98] group w-full"
                    >
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-[7px] sm:text-[9px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-1.5 py-0.5 rounded-md">{alt.brand}</span>
                            <span className="text-[11px] sm:text-sm font-bold text-white/90 truncate">{alt.model}</span>
                        </div>
                        <p className="text-[9px] sm:text-xs text-white/40 leading-snug line-clamp-2">{alt.why}</p>
                    </motion.button>
                ))}
            </div>
        </div>
    );
};
