'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { DollarSign } from 'lucide-react';
import { PriceIndicator } from '@/types';

interface PriceMeterProps {
    indicator: PriceIndicator;
    delay?: number;
}

export const PriceMeter: React.FC<PriceMeterProps> = ({ indicator, delay = 0 }) => {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 30, delay }}
            className="p-5 rounded-[1.5rem] bg-white/5 border border-white/5 relative overflow-hidden"
        >
            <div className="flex justify-between items-end mb-4">
                <div className="flex items-center gap-1.5 text-[8px] uppercase font-black tracking-[0.2em] text-white/20">
                    <DollarSign className="w-3.5 h-3.5" /> Market
                </div>
                <div className="text-right">
                    <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest block mb-0.5">
                        {indicator.level}
                    </span>
                    <span className="text-xl font-bold font-sans text-white tracking-tight">
                        {indicator.estimatedPrice}
                    </span>
                </div>
            </div>

            <div className="relative h-2 w-full bg-white/10 rounded-full mb-3">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${indicator.percent}%` }}
                    transition={{ duration: 1.5, ease: "circOut", delay: delay + 0.1 }}
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#064e3b] via-[#10b981] to-[#ecfdf5] rounded-full flex justify-end items-center"
                >
                    <div className="w-2.5 h-2.5 bg-white rounded-full shadow-[0_0_8px_white] mr-[-4px]" />
                </motion.div>
            </div>
            <div className="flex justify-between text-[7px] font-black uppercase tracking-widest text-white/15">
                <span>Value</span>
                <span>Mid</span>
                <span>Premium</span>
                <span>Elite</span>
            </div>
        </motion.div>
    );
};
