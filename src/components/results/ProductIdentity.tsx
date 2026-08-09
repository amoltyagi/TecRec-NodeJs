'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Tag, Box, Layers, Sparkles, Calendar, ShoppingCart } from 'lucide-react';
import { TechIdentity } from '@/types';

interface ProductIdentityProps {
    identity: TechIdentity;
    delay?: number;
}

const springConfig = { type: "spring", stiffness: 300, damping: 30, mass: 1 } as const;

export const ProductIdentity: React.FC<ProductIdentityProps> = ({ identity, delay = 0 }) => {
    return (
        <div className="grid grid-cols-2 gap-3 mb-3">
            <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: delay }}
                className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col gap-1"
            >
                <div className="flex items-center gap-1.5 text-[8px] sm:text-[10px] uppercase font-black tracking-widest text-white/20">
                    <Tag className="w-3 h-3" /> Brand
                </div>
                <div className="text-sm sm:text-base text-white font-bold break-words leading-tight" title={identity.brand}>
                    {identity.brand}
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: delay + 0.1 }}
                className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col gap-1"
            >
                <div className="flex items-center gap-1.5 text-[8px] sm:text-[10px] uppercase font-black tracking-widest text-white/20">
                    <Box className="w-3 h-3" /> Category
                </div>
                <div className="text-sm sm:text-base text-white font-bold break-words leading-tight" title={identity.category}>
                    {identity.category}
                </div>
            </motion.div>

            {/* New Fields */}
            <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: delay + 0.15 }}
                className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col gap-1"
            >
                <div className="flex items-center gap-1.5 text-[8px] sm:text-[10px] uppercase font-black tracking-widest text-white/20">
                    <Calendar className="w-3 h-3" /> Release
                </div>
                <div className="text-sm sm:text-base text-white font-bold truncate">
                    {identity.releaseWindow || identity.year || 'TBD'}
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: delay + 0.15 }}
                className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col gap-1 group cursor-pointer hover:bg-white/10 transition-colors"
                onClick={() => identity.amazonLink && window.open(identity.amazonLink, '_blank')}
            >
                <div className="flex items-center gap-1.5 text-[8px] sm:text-[10px] uppercase font-black tracking-widest text-white/20 group-hover:text-amber-400 transition-colors">
                    <ShoppingCart className="w-3 h-3" /> Amazon Link
                </div>
                <div className="text-sm sm:text-base text-white font-bold truncate underline decoration-white/30 decoration-1 underline-offset-4 group-hover:text-amber-400 group-hover:decoration-amber-400/50 transition-all">
                    View in Market
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: delay + 0.2 }}
                className="col-span-2 p-5 rounded-[1.5rem] bg-white/5 border border-white/5 flex flex-col gap-4"
            >
                <div className="flex items-center gap-1.5 text-[8px] sm:text-[10px] uppercase font-black tracking-widest text-white/20">
                    <Layers className="w-3.5 h-3.5" /> Technical DNA
                </div>
                <div className="grid gap-2.5">
                    {identity.keySpecs.map((spec, idx) => (
                        <div key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-white/80 font-semibold leading-snug">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            <span>{spec}</span>
                        </div>
                    ))}
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: delay + 0.3 }}
                className="col-span-2 p-5 rounded-[1.5rem] bg-emerald-500/10 border border-emerald-500/20 relative overflow-hidden"
            >
                <div className="flex items-center gap-1.5 text-[8px] sm:text-[10px] uppercase font-black tracking-widest text-emerald-400 mb-3">
                    <Sparkles className="w-3.5 h-3.5" /> Verdict
                </div>
                <div className="text-white/80 leading-relaxed font-bold text-xs sm:text-sm italic">
                    &ldquo;{identity.insight}&rdquo;
                </div>
            </motion.div>
        </div>
    );
};
