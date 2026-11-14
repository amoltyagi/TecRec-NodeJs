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
    /**
     * ISO date (or timestamp) the price figure was recorded, e.g. "2026-11-14".
     *
     * When provided, a tiny `as of Mar 2026` provenance line is painted under
     * the price reading - for street prices only. An MSRP is a launch fact and a
     * row with no basis has unknown provenance, so neither is dated.
     * Optional so every existing call site keeps rendering the same card.
     */
    asOf?: string;
}

/** Fixed month table: the label must not follow the viewer's locale. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * `Mon YYYY` from the year/month part of an ISO date or timestamp.
 *
 * Deliberately string surgery, not `new Date()`: the same instant near a month
 * boundary must not slide into another month in the viewer's timezone, and a
 * malformed value must render nothing rather than an invented date.
 */
const formatRecorded = (value?: string): string | null => {
    if (typeof value !== 'string') return null;
    const match = /^(\d{4})-(\d{2})/.exec(value.trim());
    if (!match) return null;
    const month = MONTHS[Number(match[2]) - 1];
    return month ? `${month} ${match[1]}` : null;
};

export const PriceMeter: React.FC<PriceMeterProps> = ({ indicator, delay = 0, entrance = true, asOf }) => {
    // AI-provided values are untrusted: clamp to a sane 0-100 range.
    const rawPercent = Number(indicator?.percent);
    const percent = Number.isFinite(rawPercent) ? Math.min(100, Math.max(0, rawPercent)) : 0;
    const level = typeof indicator?.level === 'string' ? indicator.level.trim() : '';
    const estimatedPrice = typeof indicator?.estimatedPrice === 'string' ? indicator.estimatedPrice.trim() : '';
    // `basis` comes from the database/AI payload: only the two known values render,
    // so a cached or malformed row can never print arbitrary text on the card.
    const basis = indicator?.basis === 'MSRP' || indicator?.basis === 'Street' ? indicator.basis : null;
    const basisHint =
        basis === 'MSRP' ? 'Official US launch list price' : basis === 'Street' ? 'Typical current US retail price' : undefined;
    // Only a street price has a meaningful observation date. An MSRP is a launch
    // fact, and for a legacy row whose basis is unknown the date would lend a
    // false air of currency - both are the defect this card exists to avoid.
    const observedOn = typeof indicator?.observedOn === 'string' ? indicator.observedOn : undefined;
    const recorded = basis === 'Street' ? formatRecorded(observedOn ?? asOf) : null;
    const listPrice = typeof indicator?.listPrice === 'string' ? indicator.listPrice.trim() : '';
    const showListPrice = basis === 'Street' && listPrice.length > 0;

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
                    <DollarSign className="w-3.5 h-3.5" aria-hidden="true" /> Price
                </div>
                <div className="text-right">
                    {(level || basis) && (
                        <div className="flex items-center justify-end gap-1.5 mb-0.5">
                            {level && (
                                <span className="text-[9px] sm:text-[11px] font-black text-emerald-400 uppercase tracking-widest">
                                    {level}
                                </span>
                            )}
                            {basis && (
                                <span
                                    className="text-[7px] sm:text-[9px] font-black text-white/60 uppercase tracking-widest border border-white/20 rounded px-1 py-px"
                                    title={basisHint}
                                >
                                    {basis}
                                </span>
                            )}
                        </div>
                    )}
                    {estimatedPrice && (
                        <span className="text-xl sm:text-2xl font-bold font-sans text-white tracking-tight">
                            {estimatedPrice}
                        </span>
                    )}
                    {recorded && (
                        <span className="mt-0.5 block text-[8px] sm:text-[9px] font-black tracking-widest text-white/60">
                            as of {recorded}
                        </span>
                    )}
                    {showListPrice && (
                        <span className="mt-px block text-[7px] sm:text-[8px] font-bold tracking-widest text-white/40">
                            MSRP {listPrice}
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
                aria-label="Price level"
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
