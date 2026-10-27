'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Layers } from 'lucide-react';
import { AlternativeModel } from '@/types';

interface AlternativeListProps {
    alternatives: AlternativeModel[];
    onSelect: (query: string) => void;
    delay?: number;
    /**
     * Entrance animation toggle (default true). Server-rendered pages pass
     * `false` so the list is visible before hydration.
     */
    entrance?: boolean;
}

export const AlternativeList: React.FC<AlternativeListProps> = ({ alternatives, onSelect, delay = 0, entrance = true }) => {
    const items = Array.isArray(alternatives) ? alternatives : [];
    if (items.length === 0) return null;

    return (
        <div className="pt-6 lg:pt-0 border-t lg:border-t-0 border-white/10">
            <h4 className="text-[8px] sm:text-[10px] uppercase tracking-[0.3em] font-black text-white/50 mb-4 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" aria-hidden="true" /> Alternatives
            </h4>
            <div className="grid gap-3">
                {items.map((alt, i) => {
                    const brand = typeof alt?.brand === 'string' ? alt.brand.trim() : '';
                    const model = typeof alt?.model === 'string' ? alt.model.trim() : '';
                    const why = typeof alt?.why === 'string' ? alt.why.trim() : '';
                    const query = [brand, model].filter(Boolean).join(' ').trim();

                    return (
                        <motion.button
                            type="button"
                            key={`${brand}-${model}-${i}`}
                            initial={entrance ? { opacity: 0, x: -10 } : false}
                            animate={{ opacity: 1, x: 0 }}
                            transition={entrance ? { delay: delay + (i * 0.05) } : { duration: 0 }}
                            onClick={() => {
                                if (query) onSelect(query);
                            }}
                            disabled={!query}
                            className="p-4 sm:p-5 text-left rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all active:scale-[0.98] group w-full disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <div className="flex items-center gap-2 mb-1.5 min-w-0">
                                {brand && (
                                    <span className="shrink-0 text-[7px] sm:text-[9px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-1.5 py-0.5 rounded-md">{brand}</span>
                                )}
                                {model && (
                                    <span className="min-w-0 text-[11px] sm:text-sm font-bold text-white/90 truncate">{model}</span>
                                )}
                            </div>
                            {why && (
                                <p className="text-[9px] sm:text-xs text-white/60 leading-snug line-clamp-2">{why}</p>
                            )}
                        </motion.button>
                    );
                })}
            </div>
        </div>
    );
};
