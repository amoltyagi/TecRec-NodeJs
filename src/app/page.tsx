'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Cpu, ClipboardPaste, ScanBarcode, ArrowLeft, Loader2, Info, ShieldCheck } from 'lucide-react';
import { CameraView } from '@/components/scanner/CameraView';
import { ProductIdentity } from '@/components/results/ProductIdentity';
import { PriceMeter } from '@/components/results/PriceMeter';
import { AlternativeList } from '@/components/results/AlternativeList';
import { DecodeResult } from '@/types';
import { useToast } from '@/context/ToastContext';

const springConfig = { type: "spring", stiffness: 300, damping: 30, mass: 1 } as const;

export default function Home() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const [result, setResult] = useState<DecodeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessageIdx, setLoadingMessageIdx] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const { showError, showSuccess } = useToast();

  const loadingMessages = [
    "Identifying Category...",
    "Extracting DNA...",
    "Scanning Market...",
    "Comparing Alternatives...",
    "Analyzing Value..."
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      interval = setInterval(() => {
        setLoadingMessageIdx((prev) => (prev + 1) % loadingMessages.length);
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [loading]);

  // Cleanup: abort any pending requests on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleDecode = async (e?: React.FormEvent, overrideModel?: string) => {
    e?.preventDefault();
    const modelToUse = overrideModel || searchQuery;
    if (!modelToUse.trim()) return;

    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();

    setIsAnalyzing(true);
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/decode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelToUse }),
        signal: abortControllerRef.current.signal,
      });

      const data = await res.json();

      if (data.error) {
        showError(data.error);
        setResult({ error: data.error });
      } else {
        showSuccess('Product decoded successfully');
        setResult(data);
      }
    } catch (err: unknown) {
      // Only show error if not aborted
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      showError('Failed to connect to intelligence engine.');
      setResult({ error: 'Failed to connect to intelligence engine.' });
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleCapture = async (imageData: string) => {
    setIsScanning(true);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData }),
      });

      const data = await res.json();
      if (data.found && data.model) {
        setSearchQuery(data.model);
        setIsCameraOpen(false);
        handleDecode(undefined, data.model);
      } else {
        showError('Could not clearly identify a model number. Please try closer or adjust lighting.');
      }
    } catch (err) {
      console.error('Scan error:', err);
      showError('Scanning failed. Please try again.');
    } finally {
      setIsScanning(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setSearchQuery(text);
    } catch (err) {
      console.error('Failed to read clipboard contents: ', err);
    }
  };

  const handleReset = () => {
    setIsAnalyzing(false);
    setSearchQuery('');
    setResult(null);
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-start sm:justify-center overflow-hidden p-4 sm:p-6 pt-12 sm:pt-6 font-sans antialiased">
      <AnimatePresence mode="wait">
        {!isAnalyzing ? (
          <motion.div
            key="home"
            initial={{ opacity: 0, scale: 0.98, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.05, y: -30 }}
            transition={springConfig}
            className="w-full max-w-[400px] sm:max-w-xl z-10 flex flex-col items-center"
          >
            <div className="liquid-glass specular-highlight w-full rounded-[2.5rem] sm:rounded-[3.5rem] px-6 py-10 sm:p-12 text-center text-white overflow-hidden relative flex flex-col items-center">
              <header className="mb-8 sm:mb-10 w-full">
                <motion.div
                  initial={{ scale: 0, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ ...springConfig, delay: 0.2 }}
                  className="mb-8 inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-[1.5rem] sm:rounded-3xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-400 shadow-[0_0_40px_rgba(52,211,153,0.2)]"
                >
                  <Cpu className="w-8 h-8 sm:w-10 sm:h-10" />
                </motion.div>
                <h1 className="text-4xl sm:text-5xl font-bold mb-4 tracking-tight leading-tight px-2">
                  TecRec <span className="text-emerald-400">Universal</span>
                </h1>
                <p className="text-sm sm:text-lg text-white/50 font-light max-w-[280px] sm:max-w-sm mx-auto leading-relaxed">
                  Turn cryptic codes into technical truth. Decode specs, value, and alternatives.
                </p>
              </header>

              <form onSubmit={(e) => handleDecode(e)} className="relative group mb-8 w-full">
                <input
                  type="text"
                  placeholder="Paste model code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-6 pl-12 sm:pl-14 pr-[6rem] sm:pr-[12rem] text-base sm:text-lg text-white placeholder:text-white/20 outline-none focus:border-emerald-500/40 focus:bg-white/10 transition-all shadow-inner"
                />
                <Search className="absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20 group-focus-within:text-emerald-400 transition-colors" />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={handlePaste}
                    className="p-2 sm:p-3 rounded-xl bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all border border-white/10 shrink-0"
                  >
                    <ClipboardPaste className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                  <button
                    type="submit"
                    className="px-4 sm:px-8 py-2.5 sm:py-3.5 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white font-bold text-xs sm:text-sm border border-emerald-400/50 hover:shadow-[0_0_20px_rgba(52,211,153,0.3)] transition-all transform active:scale-95 shrink-0"
                  >
                    Decode
                  </button>
                </div>
              </form>

              <div className="flex flex-col items-center gap-6 w-full mb-4">
                <button
                  onClick={() => setIsCameraOpen(true)}
                  className="flex items-center gap-3 px-8 py-4 w-full sm:w-auto rounded-2xl bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-400/30 text-emerald-400 hover:text-white hover:bg-emerald-500/20 hover:border-emerald-400/50 transition-all group active:scale-95 shadow-[0_0_20px_rgba(52,211,153,0.15)]"
                >
                  <ScanBarcode className="w-5 h-5 group-hover:text-emerald-300 transition-colors shrink-0" />
                  <span className="font-bold text-[11px] sm:text-xs uppercase tracking-widest truncate">Scan Product Tags in Store</span>
                </button>

                <div className="flex flex-wrap justify-center gap-2 px-2">
                  {['Sony A7 IV', 'SDSQXCD-128G', 'OLED65G4', 'WGG24401GB'].map((suggestion, idx) => (
                    <motion.button
                      key={suggestion}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...springConfig, delay: 0.3 + (idx * 0.05) }}
                      onClick={() => {
                        setSearchQuery(suggestion);
                        handleDecode(undefined, suggestion);
                      }}
                      className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest px-3.5 py-2.5 rounded-full border border-white/10 bg-white/5 text-white/30 hover:text-white/70 hover:bg-white/10 transition-all"
                    >
                      {suggestion}
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.98, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.02, y: -20 }}
            transition={springConfig}
            className="w-full max-w-[400px] sm:max-w-xl z-10 h-[82vh] sm:h-auto"
          >
            <div className="liquid-glass specular-highlight rounded-[2rem] sm:rounded-[3rem] px-5 py-6 sm:px-10 sm:py-8 text-white h-full flex flex-col relative overflow-hidden">
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex-1 flex flex-col items-center justify-center text-center"
                  >
                    <motion.div
                      animate={{ rotate: 360, scale: [1, 1.1, 1] }}
                      transition={{ rotate: { repeat: Infinity, duration: 3, ease: "linear" }, scale: { repeat: Infinity, duration: 2 } }}
                      className="mb-6 p-4 rounded-full bg-emerald-500/10 border border-emerald-500/20"
                    >
                      <Loader2 className="w-10 h-10 text-emerald-400" />
                    </motion.div>
                    <motion.p
                      key={loadingMessageIdx}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                      className="text-base font-light text-white/40 tracking-wide"
                    >
                      {loadingMessages[loadingMessageIdx]}
                    </motion.p>
                  </motion.div>
                ) : result?.error ? (
                  <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col items-center justify-center text-center">
                    <Info className="w-10 h-10 text-red-400/50 mb-4" />
                    <h3 className="text-xl font-bold mb-2">Decoding Failed</h3>
                    <p className="text-white/40 text-xs mb-8 max-w-[220px]">{result.error}</p>
                    <button onClick={handleReset} className="px-10 py-3 rounded-xl bg-white/10 border border-white/20 font-bold text-[10px] tracking-widest uppercase">Try Again</button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="content"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex-1 flex flex-col overflow-hidden"
                  >
                    <header className="flex items-center justify-between mb-5 shrink-0">
                      <button onClick={handleReset} className="p-2.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 transition-all active:scale-90">
                        <ArrowLeft className="w-5 h-5 text-white/40" />
                      </button>
                      <div className="flex items-center gap-1.5 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400/80">Verified</span>
                      </div>
                      <div className="w-10" />
                    </header>

                    <div className="space-y-4 flex-1 custom-scrollbar overflow-y-auto pr-1 pb-4">
                      {result?.identity && <ProductIdentity identity={result.identity} />}

                      {result?.identity?.priceIndicator && (
                        <PriceMeter indicator={result.identity.priceIndicator} delay={0.4} />
                      )}

                      {result?.alternatives && (
                        <AlternativeList
                          alternatives={result.alternatives}
                          onSelect={(model) => {
                            handleDecode(undefined, model);
                            setSearchQuery(model);
                          }}
                          delay={0.6}
                        />
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <CameraView
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCapture}
        isScanning={isScanning}
      />
    </div>
  );
}
