import React from 'react';
import Link from 'next/link';
import { Compass, Home } from 'lucide-react';

/**
 * Global 404. Rendered inside the root layout, so the glass UI, aurora
 * background and toast provider are all available.
 */
export default function NotFound() {
  return (
    <div className="relative min-h-dvh w-full flex flex-col items-center justify-center px-safe pt-safe pb-safe sm:p-6 lg:p-10 font-sans antialiased">
      <main className="liquid-glass specular-highlight w-full max-w-lg rounded-none sm:rounded-[3rem] p-8 sm:p-12 text-white text-center flex flex-col items-center">
        <div className="mb-6 inline-flex items-center justify-center w-16 h-16 rounded-[1.5rem] bg-emerald-500/20 border border-emerald-400/30 text-emerald-400 shadow-[0_0_40px_rgba(52,211,153,0.2)]">
          <Compass className="w-8 h-8" aria-hidden="true" />
        </div>

        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400/80 mb-3">
          Error 404
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold mb-3 tracking-tight leading-tight">
          Page not found
        </h1>
        <p className="text-sm text-white/60 leading-relaxed mb-8 max-w-sm">
          That model page does not exist — it may have been removed or the link was mistyped.
          Decode any tech product by its model code instead.
        </p>

        <Link
          href="/"
          className="flex items-center justify-center gap-2 px-7 py-3 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white font-bold text-xs uppercase tracking-widest border border-emerald-400/50 hover:shadow-[0_0_20px_rgba(52,211,153,0.3)] transition-all active:scale-95"
        >
          <Home className="w-4 h-4" aria-hidden="true" />
          Back to decoder
        </Link>
      </main>
    </div>
  );
}
