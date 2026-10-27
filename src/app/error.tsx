'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';

interface AppErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Route-level error boundary. Details stay in the console/logs; the UI only
 * shows a generic message so no internal state leaks to the visitor.
 */
export default function AppError({ error, reset }: AppErrorProps) {
  useEffect(() => {
    console.error('Unhandled application error:', error);
  }, [error]);

  return (
    <div className="relative min-h-dvh w-full flex flex-col items-center justify-center px-safe pt-safe pb-safe sm:p-6 lg:p-10 font-sans antialiased">
      <main className="liquid-glass specular-highlight w-full max-w-lg rounded-none sm:rounded-[3rem] p-8 sm:p-12 text-white text-center flex flex-col items-center">
        <div className="mb-6 inline-flex items-center justify-center w-16 h-16 rounded-[1.5rem] bg-red-500/15 border border-red-400/30 text-red-400">
          <AlertTriangle className="w-8 h-8" aria-hidden="true" />
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold mb-3 tracking-tight leading-tight">
          Something went wrong
        </h1>
        <p className="text-sm text-white/60 leading-relaxed mb-8 max-w-sm">
          The decoder hit an unexpected error and could not finish this request. Nothing was
          charged or saved — please try again.
        </p>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={reset}
            className="flex items-center justify-center gap-2 px-7 py-3 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white font-bold text-xs uppercase tracking-widest border border-emerald-400/50 hover:shadow-[0_0_20px_rgba(52,211,153,0.3)] transition-all active:scale-95"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            Try again
          </button>
          <Link
            href="/"
            className="flex items-center justify-center gap-2 px-7 py-3 rounded-xl bg-white/5 border border-white/15 text-white/80 hover:text-white hover:bg-white/10 font-bold text-xs uppercase tracking-widest transition-all active:scale-95"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            Back to decoder
          </Link>
        </div>

        {error.digest && (
          <p className="mt-7 text-[10px] font-mono tracking-wider text-white/50 break-all">
            Reference: {error.digest}
          </p>
        )}
      </main>
    </div>
  );
}
