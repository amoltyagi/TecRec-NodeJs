'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { DollarSign } from 'lucide-react';
import { PriceIndicator } from '@/types';

interface PriceMeterProps {
    indicator: PriceIndicator;
    delay?: number;
    /**
     * Entrance animation toggle (default true).
     *
     * Server-rendered SEO pages pass `false`: the card and the fill bar are
     * painted at their final values immediately (`initial={false}`) instead of
     * starting at opacity:0 / width:0.
     */
    entrance?: boolean;
}

export const PriceMeter: React.FC<PriceMeterProps> = ({ indicator, delay = 0, entrance = true }) => {
    // AI-provided values are untrusted: clamp to a sane 0-100 range.
    const rawPercent = Number(indicator?.percent);
    const percent = Number.isFinite(rawPercent) ? Math.min(100, Math.max(0, rawPercent)) : 0;
    const level = typeof indicator?.level === 'string' ? indicator.level.trim() : '';
    const estimatedPrice = typeof indicator?.estimatedPrice === 'string' ? indicator.estimatedPrice.trim() : '';

    const fill = (
        <div className="w-2.5 h-2.5 bg-white rounded-full shadow-[0_0_8px_white] mr-[-4px]" />
    );
    const fillClass = "absolute inset-y-0 left-0 bg-gradient-to-r from-[#064e3b] via-[#10b981] to-[#ecfdf5] rounded-full flex justify-end items-center";

    return (
        <motion.div
            initial={entrance ? { opacity: 0, scale: 0.98 } : false}
            animate={{ opacity: 1, scale: 1 }}
            transition={entrance ? { type: "spring", stiffness: 300, damping: 30, delay } : { duration: 0 }}
            className="p-5 rounded-[1.5rem] bg-white/5 border border-white/5 relative overflow-hidden"
        >
            <div className="flex justify-between items-end mb-4">
                <div className="flex items-center gap-1.5 text-[8px] sm:text-[10px] uppercase font-black tracking-[0.2em] text-white/50">
                    <DollarSign className="w-3.5 h-3.5" aria-hidden="true" /> Market
                </div>
                <div className="text-right">
                    {level && (
                        <span className="text-[9px] sm:text-[11px] font-black text-emerald-400 uppercase tracking-widest block mb-0.5">
                            {level}
                        </span>
                    )}
                    {estimatedPrice && (
                        <span className="text-xl sm:text-2xl font-bold font-sans text-white tracking-tight">
                            {estimatedPrice}
                        </span>
                    )}
                </div>
            </div>

            <div
                className="relative h-2 w-full bg-white/10 rounded-full mb-3"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-label="Market price level"
            >
                {entrance ? (
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${percent}%` }}
                        transition={{ duration: 1.5, ease: "circOut", delay: delay + 0.1 }}
                        className={fillClass}
                    >
                        {fill}
                    </motion.div>
                ) : (
                    <div className={fillClass} style={{ width: `${percent}%` }}>
                        {fill}
                    </div>
                )}
            </div>
            <div className="flex justify-between text-[7px] sm:text-[9px] font-black uppercase tracking-widest text-white/50">
                <span>Value</span>
                <span>Mid</span>
                <span>Prem</span>
                <span>Elite</span>
            </div>
        </motion.div>
    );
};
