'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Tag, Box, Layers, Sparkles, Calendar, ShoppingCart } from 'lucide-react';
import { TechIdentity } from '@/types';

interface ProductIdentityProps {
    identity: TechIdentity;
    delay?: number;
    /**
     * Entrance animation toggle (default true).
     *
     * Server-rendered SEO pages pass `false`: the cards then render at their
     * final values on first paint (`initial={false}`) instead of starting at
     * opacity:0, so the content is visible and crawlable before hydration.
     */
    entrance?: boolean;
}

const springConfig = { type: "spring", stiffness: 300, damping: 30, mass: 1 } as const;

/** AI-generated URLs are untrusted: only ever open absolute https links. */
const isSafeHttpsLink = (url: unknown): url is string =>
    typeof url === 'string' && /^https:\/\//i.test(url);

export const ProductIdentity: React.FC<ProductIdentityProps> = ({ identity, delay = 0, entrance = true }) => {
    const brand = identity?.brand || 'Unknown';
    const category = identity?.category || 'Uncategorised';
    const release = identity?.releaseWindow || identity?.year || 'TBD';
    const specs = Array.isArray(identity?.keySpecs) ? identity.keySpecs : [];
    const insight = typeof identity?.insight === 'string' ? identity.insight.trim() : '';
    const amazonUrl = isSafeHttpsLink(identity?.amazonLink) ? identity.amazonLink : null;

    // Same spring on every card; when entrance is off there is nothing to animate.
    const cardMotion = (cardDelay: number) => ({
        initial: entrance ? { opacity: 0, y: 10 } : (false as const),
        animate: { opacity: 1, y: 0 },
        transition: { ...springConfig, delay: entrance ? cardDelay : 0 },
    });

    return (
        <div className="grid grid-cols-2 gap-3 mb-3">
            <motion.div
                {...cardMotion(delay)}
                className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col gap-1"
            >
                <div className="flex items-center gap-1.5 text-[8px] sm:text-[10px] uppercase font-black tracking-widest text-white/50">
                    <Tag className="w-3 h-3" aria-hidden="true" /> Brand
                </div>
                <div className="text-sm sm:text-base text-white font-bold break-words leading-tight" title={brand}>
                    {brand}
                </div>
            </motion.div>

            <motion.div
                {...cardMotion(delay + 0.1)}
                className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col gap-1"
            >
                <div className="flex items-center gap-1.5 text-[8px] sm:text-[10px] uppercase font-black tracking-widest text-white/50">
                    <Box className="w-3 h-3" aria-hidden="true" /> Category
                </div>
                <div className="text-sm sm:text-base text-white font-bold break-words leading-tight" title={category}>
                    {category}
                </div>
            </motion.div>

            <motion.div
                {...cardMotion(delay + 0.15)}
                className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col gap-1"
            >
                <div className="flex items-center gap-1.5 text-[8px] sm:text-[10px] uppercase font-black tracking-widest text-white/50">
                    <Calendar className="w-3 h-3" aria-hidden="true" /> Release
                </div>
                <div className="text-sm sm:text-base text-white font-bold truncate min-w-0">
                    {release}
                </div>
            </motion.div>

            {amazonUrl && (
                <motion.a
                    {...cardMotion(delay + 0.15)}
                    href={amazonUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col gap-1 group cursor-pointer hover:bg-white/10 transition-colors"
                >
                    <div className="flex items-center gap-1.5 text-[8px] sm:text-[10px] uppercase font-black tracking-widest text-white/50 group-hover:text-amber-400 transition-colors">
                        <ShoppingCart className="w-3 h-3" aria-hidden="true" /> Amazon Link
                    </div>
                    <div className="text-sm sm:text-base text-white font-bold truncate min-w-0 underline decoration-white/30 decoration-1 underline-offset-4 group-hover:text-amber-400 group-hover:decoration-amber-400/50 transition-all">
                        View in Market
                    </div>
                </motion.a>
            )}

            {specs.length > 0 && (
                <motion.div
                    {...cardMotion(delay + 0.2)}
                    className="col-span-2 p-5 rounded-[1.5rem] bg-white/5 border border-white/5 flex flex-col gap-4"
                >
                    <div className="flex items-center gap-1.5 text-[8px] sm:text-[10px] uppercase font-black tracking-widest text-white/50">
                        <Layers className="w-3.5 h-3.5" aria-hidden="true" /> Technical DNA
                    </div>
                    <div className="grid gap-2.5">
                        {specs.map((spec, idx) => (
                            <div key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-white/80 font-semibold leading-snug">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                                <span>{spec}</span>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}

            {insight && (
                <motion.div
                    {...cardMotion(delay + 0.3)}
                    className="col-span-2 p-5 rounded-[1.5rem] bg-emerald-500/10 border border-emerald-500/20 relative overflow-hidden"
                >
                    <div className="flex items-center gap-1.5 text-[8px] sm:text-[10px] uppercase font-black tracking-widest text-emerald-400 mb-3">
                        <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> Verdict
                    </div>
                    <div className="text-white/80 leading-relaxed font-bold text-xs sm:text-sm italic">
                        &ldquo;{insight}&rdquo;
                    </div>
                </motion.div>
            )}
        </div>
    );
};
