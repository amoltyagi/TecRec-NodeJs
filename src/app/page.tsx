'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Cpu, ClipboardPaste, ScanBarcode, ArrowLeft, Loader2, Info, Sparkles, ExternalLink } from 'lucide-react';
import { CameraView } from '@/components/scanner/CameraView';
import { ProductIdentity } from '@/components/results/ProductIdentity';
import { PriceMeter } from '@/components/results/PriceMeter';
import { AlternativeList } from '@/components/results/AlternativeList';
import { AlternativeModel, DecodeResult } from '@/types';
import { useToast } from '@/context/ToastContext';

const springConfig = { type: "spring", stiffness: 300, damping: 30, mass: 1 } as const;

/** Server-side sanitizer caps model codes at 200 chars; mirror it on the client. */
const MAX_MODEL_LENGTH = 200;

const loadingMessages = [
  "Identifying Category...",
  "Extracting DNA...",
  "Scanning Market...",
  "Comparing Alternatives...",
  "Analyzing Value..."
];

const CONNECTION_ERROR = 'Failed to connect to intelligence engine.';
const NO_DATA_ERROR = 'No technical data was returned for that code. Try another model number.';
const SCAN_NOT_FOUND_ERROR = 'Could not clearly identify a model number. Please try closer or adjust lighting.';

/** Decode payloads may carry a cache-permalink slug (typed locally). */
type DecodeResponse = DecodeResult & { slug?: string };

interface ScanPayload {
  found?: boolean;
  model?: string;
  identity?: DecodeResult['identity'];
  alternatives?: DecodeResult['alternatives'];
  slug?: string;
  error?: string;
}

/** DOMException is not reliably `instanceof Error` across browsers. */
const isAbortError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError';

/** Extract a safe, user-facing error string from an untrusted response body. */
const extractErrorMessage = (body: unknown): string | null => {
  if (body && typeof body === 'object') {
    const value = (body as { error?: unknown }).error;
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
};

/** Slugs are server-generated, but never build a URL from unvalidated input. */
const safeSlug = (value: unknown): string | undefined =>
  typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/i.test(value) ? value : undefined;

const readJsonBody = async (res: Response): Promise<unknown> => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

export default function Home() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [bottomQuery, setBottomQuery] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const [result, setResult] = useState<DecodeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessageIdx, setLoadingMessageIdx] = useState(0);

  // Abort handle for superseding requests. Never cleared by a request that is
  // no longer the current one - see the `finally` block of handleDecode.
  const abortControllerRef = useRef<AbortController | null>(null);
  // Monotonic request id: only the newest request may update shared UI state.
  const requestIdRef = useRef(0);
  // Double-submit guard: the exiting card stays clickable while AnimatePresence
  // animates it out, so the same in-flight model must not be requested twice.
  const inFlightRef = useRef(false);
  const inFlightModelRef = useRef<string | null>(null);
  const { showError, showSuccess } = useToast();

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setLoadingMessageIdx((prev) => (prev + 1) % loadingMessages.length);
    }, 1500);
    return () => clearInterval(interval);
  }, [loading]);

  const handleDecode = async (event?: React.FormEvent, overrideModel?: string) => {
    event?.preventDefault();
    const modelToUse = (overrideModel ?? searchQuery).trim().slice(0, MAX_MODEL_LENGTH);
    if (!modelToUse) return;
    // A model supplied programmatically (deep link, alternative, suggestion) is
    // also what the user is "searching for" - reflect it in the input.
    if (overrideModel !== undefined) setSearchQuery(modelToUse);

    // Ignore a duplicate submit of the model that is already in flight; a
    // different model supersedes it (and aborts the old request below).
    if (inFlightRef.current && inFlightModelRef.current === modelToUse) return;
    inFlightRef.current = true;
    inFlightModelRef.current = modelToUse;

    // Supersede any in-flight request: it must not clobber this one's UI state.
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const requestId = ++requestIdRef.current;

    setIsAnalyzing(true);
    setLoading(true);
    setLoadingMessageIdx(0);
    setResult(null);

    try {
      const res = await fetch('/api/decode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelToUse }),
        signal: controller.signal,
      });

      const body = await readJsonBody(res);

      // Never trust the body of a failed response.
      if (!res.ok) {
        if (requestId !== requestIdRef.current) return;
        const message = extractErrorMessage(body) || (res.status === 413
          ? 'That input is too large to decode. Try a shorter model code.'
          : CONNECTION_ERROR);
        showError(message);
        setResult({ error: message });
        return;
      }

      // A superseded request must not overwrite the newer request's result.
      if (requestId !== requestIdRef.current) return;

      const payload: DecodeResponse = body && typeof body === 'object' ? (body as DecodeResponse) : {};
      const serverError = extractErrorMessage(body);
      if (serverError) {
        showError(serverError);
        setResult({ error: serverError });
        return;
      }

      const hasIdentity = Boolean(payload.identity);
      const hasAlternatives = Array.isArray(payload.alternatives) && payload.alternatives.length > 0;
      if (!hasIdentity && !hasAlternatives) {
        showError(NO_DATA_ERROR);
        setResult({ error: NO_DATA_ERROR });
        return;
      }

      showSuccess('Product decoded successfully');
      setResult({
        identity: payload.identity,
        alternatives: payload.alternatives,
        slug: safeSlug(payload.slug),
      });
    } catch (err) {
      // Aborts are expected: a newer request or a cancel superseded this one.
      if (isAbortError(err)) return;
      if (requestId !== requestIdRef.current) return;
      showError(CONNECTION_ERROR);
      setResult({ error: CONNECTION_ERROR });
    } finally {
      // Only the newest request may clear loading / in-flight state or drop the
      // shared controller reference.
      if (requestId === requestIdRef.current) {
        inFlightRef.current = false;
        inFlightModelRef.current = null;
        setLoading(false);
        if (abortControllerRef.current === controller) abortControllerRef.current = null;
      }
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

      const body = await readJsonBody(res);
      const serverError = extractErrorMessage(body);

      // The scan endpoint reports failures as `{ error, model }` without `found`,
      // so check for an error BEFORE trusting `found`, and never re-decode on failure.
      if (!res.ok || serverError) {
        showError(serverError || 'Scanning failed. Please try again.');
        return;
      }

      const payload = (body && typeof body === 'object' ? body : {}) as ScanPayload;
      if (!payload.found || typeof payload.model !== 'string' || payload.model.trim().length === 0) {
        showError(SCAN_NOT_FOUND_ERROR);
        return;
      }

      const scannedModel = payload.model.trim().slice(0, MAX_MODEL_LENGTH);
      setSearchQuery(scannedModel);
      setIsCameraOpen(false);

      const alternatives: AlternativeModel[] = Array.isArray(payload.alternatives) ? payload.alternatives : [];

      if (payload.identity || alternatives.length > 0) {
        // The scan response already carries the decoded product: render it directly
        // instead of paying for a second /api/decode round trip.
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        requestIdRef.current += 1; // invalidate any in-flight text decode
        inFlightRef.current = false;
        inFlightModelRef.current = null;
        setLoading(false);
        setIsAnalyzing(true);
        setResult({
          identity: payload.identity,
          alternatives,
          slug: safeSlug(payload.slug),
        });
        showSuccess('Product decoded successfully');
      } else {
        // Unexpected partial payload: fall back to a normal text decode by model code.
        await handleDecode(undefined, scannedModel);
      }
    } catch (err) {
      console.error('Scan error:', err);
      if (!isAbortError(err)) showError('Scanning failed. Please try again.');
    } finally {
      setIsScanning(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setSearchQuery(text.slice(0, MAX_MODEL_LENGTH));
    } catch (err) {
      console.error('Failed to read clipboard contents: ', err);
      showError('Clipboard access was blocked by the browser.');
    }
  };

  const handleBottomPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setBottomQuery(text.slice(0, MAX_MODEL_LENGTH));
    } catch (err) {
      console.error('Failed to read clipboard contents: ', err);
      showError('Clipboard access was blocked by the browser.');
    }
  };

  const handleBottomSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const query = bottomQuery.trim();
    if (!query) return;
    setSearchQuery(query);
    setBottomQuery('');
    handleDecode(undefined, query);
  };

  const handleReset = () => {
    // Cancel anything in flight so a late response cannot repopulate this view.
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    requestIdRef.current += 1;
    inFlightRef.current = false;
    inFlightModelRef.current = null;
    setIsAnalyzing(false);
    setLoading(false);
    setSearchQuery('');
    setBottomQuery('');
    setResult(null);
  };

  /** Abort an in-flight decode and go back home with the query preserved. */
  const handleCancel = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    requestIdRef.current += 1;
    inFlightRef.current = false;
    inFlightModelRef.current = null;
    setLoading(false);
    setIsAnalyzing(false);
    setResult(null);
    // searchQuery is intentionally kept so the user can edit and resubmit.
  };

  /** Re-run the query that failed; the search query is never cleared on error. */
  const handleRetry = () => {
    const query = searchQuery.trim();
    if (!query) {
      handleReset();
      return;
    }
    setBottomQuery('');
    handleDecode(undefined, query);
  };

  // Deep link support: /?q=MODEL pre-fills and auto-decodes.
  // Used by SEO product pages linking alternatives back into live decodes.
  // Note: there is deliberately no unmount abort here - under React StrictMode
  // the dev mount -> unmount -> mount cycle would abort this very request, and
  // the handled-flag prevents a retry, leaving an empty result shell.
  const deepLinkHandledRef = useRef(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (!q || deepLinkHandledRef.current) return;

    window.history.replaceState({}, '', '/');

    // Deferred so the URL is read during mount but the decode (which updates
    // state and starts a request) does not run synchronously inside the effect.
    // The ref guard moves into the callback: under StrictMode the effect runs
    // twice, and only the surviving timer may fire.
    const timer = setTimeout(() => {
      if (deepLinkHandledRef.current) return;
      deepLinkHandledRef.current = true;
      handleDecode(undefined, q);
    }, 0);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const identity = result?.identity;
  const rawAlternatives = result?.alternatives;
  const alternatives: AlternativeModel[] = Array.isArray(rawAlternatives) ? rawAlternatives : [];
  const hasContent = Boolean(identity) || alternatives.length > 0;
  const permalinkSlug = result?.slug;

  return (
    <div className="relative min-h-dvh w-full flex flex-col items-stretch justify-start sm:items-center sm:justify-center overflow-hidden pt-safe pb-safe px-safe sm:p-6 lg:p-10 font-sans antialiased">
      <AnimatePresence mode="wait">
        {!isAnalyzing ? (
          <motion.div
            key="home"
            initial={{ opacity: 0, scale: 0.98, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.05, y: -30 }}
            transition={springConfig}
            className="w-full max-w-none sm:max-w-2xl z-10 flex-1 sm:flex-none flex flex-col items-center"
          >
            <div className="liquid-glass specular-highlight w-full flex-1 sm:flex-none rounded-none sm:rounded-[3.5rem] px-6 py-10 sm:p-12 lg:p-16 text-center text-white overflow-hidden relative flex flex-col items-center justify-center">
              <header className="mb-8 sm:mb-10 w-full">
                <motion.div
                  initial={{ scale: 0, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ ...springConfig, delay: 0.2 }}
                  className="mb-8 inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-[1.5rem] sm:rounded-3xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-400 shadow-[0_0_40px_rgba(52,211,153,0.2)]"
                >
                  <Cpu className="w-8 h-8 sm:w-10 sm:h-10" aria-hidden="true" />
                </motion.div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4 tracking-tight leading-tight px-2">
                  TecRec <span className="text-emerald-400">Universal</span>
                </h1>
                <p className="text-sm sm:text-lg lg:text-xl text-white/50 font-light max-w-[280px] sm:max-w-sm lg:max-w-md mx-auto leading-relaxed">
                  Turn cryptic codes into technical truth. Decode specs, value, and alternatives.
                </p>
              </header>

              <form onSubmit={(e) => handleDecode(e)} className="relative group mb-8 w-full">
                <input
                  type="text"
                  placeholder="Paste model code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value.slice(0, MAX_MODEL_LENGTH))}
                  aria-label="Tech model code"
                  maxLength={MAX_MODEL_LENGTH}
                  autoComplete="off"
                  enterKeyHint="search"
                  autoFocus
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-6 pl-12 sm:pl-14 pr-[6rem] sm:pr-[12rem] text-base sm:text-lg lg:text-xl text-white placeholder:text-white/40 outline-none focus:border-emerald-500/40 focus:bg-white/10 transition-all shadow-inner"
                />
                <Search className="absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 group-focus-within:text-emerald-400 transition-colors" aria-hidden="true" />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={handlePaste}
                    aria-label="Paste model code from clipboard"
                    className="p-2 sm:p-3 rounded-xl bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-all border border-white/10 shrink-0"
                  >
                    <ClipboardPaste className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 sm:px-8 py-2.5 sm:py-3.5 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white font-bold text-xs sm:text-sm border border-emerald-400/50 hover:shadow-[0_0_20px_rgba(52,211,153,0.3)] transition-all transform active:scale-95 shrink-0 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
                  >
                    Decode
                  </button>
                </div>
              </form>

              <div className="flex flex-col items-center gap-6 w-full mb-4">
                <button
                  type="button"
                  onClick={() => setIsCameraOpen(true)}
                  className="flex items-center gap-3 px-8 py-4 w-full sm:w-auto rounded-2xl bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-400/30 text-emerald-400 hover:text-white hover:bg-emerald-500/20 hover:border-emerald-400/50 transition-all group active:scale-95 shadow-[0_0_20px_rgba(52,211,153,0.15)]"
                >
                  <ScanBarcode className="w-5 h-5 group-hover:text-emerald-300 transition-colors shrink-0" aria-hidden="true" />
                  <span className="font-bold text-[11px] sm:text-xs lg:text-sm uppercase tracking-widest truncate">Scan Product Tags in Store</span>
                </button>

                <div className="flex flex-wrap justify-center gap-2 px-2">
                  {['RTX 5090', 'Samsung 990 Pro', 'Sony A7 IV', 'Corsair Vengeance DDR5'].map((suggestion, idx) => (
                    <motion.button
                      type="button"
                      key={suggestion}
                      disabled={loading}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...springConfig, delay: 0.3 + (idx * 0.05) }}
                      onClick={() => {
                        setSearchQuery(suggestion);
                        handleDecode(undefined, suggestion);
                      }}
                      className="text-[9px] sm:text-[10px] lg:text-xs font-bold uppercase tracking-widest px-3.5 py-2.5 rounded-full border border-white/10 bg-white/5 text-white/50 hover:text-white/70 hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="w-full max-w-none sm:max-w-2xl lg:max-w-5xl z-10 flex-1 sm:flex-none min-h-0 flex flex-col"
          >
            <div className="liquid-glass specular-highlight rounded-none sm:rounded-[3rem] px-5 py-6 sm:p-10 text-white w-full flex-1 sm:flex-none min-h-0 sm:min-h-[38rem] sm:max-h-[85dvh] flex flex-col relative overflow-hidden">
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    role="status"
                    aria-live="polite"
                    className="flex-1 flex flex-col items-center justify-center text-center"
                  >
                    <motion.div
                      animate={{ rotate: 360, scale: [1, 1.1, 1] }}
                      transition={{ rotate: { repeat: Infinity, duration: 3, ease: "linear" }, scale: { repeat: Infinity, duration: 2 } }}
                      className="mb-6 p-4 rounded-full bg-emerald-500/10 border border-emerald-500/20"
                    >
                      <Loader2 className="w-10 h-10 text-emerald-400" aria-hidden="true" />
                    </motion.div>
                    <div className="h-6 flex items-center justify-center">
                      <AnimatePresence mode="wait">
                        <motion.p
                          key={loadingMessageIdx}
                          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                          className="text-base font-light text-white/60 tracking-wide"
                        >
                          {loadingMessages[loadingMessageIdx]}
                        </motion.p>
                      </AnimatePresence>
                    </div>
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="mt-8 px-6 py-2.5 rounded-xl bg-white/5 border border-white/15 text-white/60 hover:text-white hover:bg-white/10 font-bold text-[10px] uppercase tracking-widest transition-all active:scale-95"
                    >
                      Cancel
                    </button>
                  </motion.div>
                ) : result?.error || !hasContent ? (
                  <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col items-center justify-center text-center">
                    <Info className="w-10 h-10 text-red-400/50 mb-4" aria-hidden="true" />
                    <h3 className="text-xl font-bold mb-2">
                      {result?.error ? 'Decoding Failed' : 'No Data Found'}
                    </h3>
                    <p className="text-white/60 text-xs mb-8 max-w-[240px]">{result?.error || NO_DATA_ERROR}</p>
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="px-10 py-3 rounded-xl bg-white/10 border border-white/20 font-bold text-[10px] tracking-widest uppercase hover:bg-white/15 transition-all active:scale-95"
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={handleReset}
                      className="mt-4 text-[10px] font-bold uppercase tracking-widest text-white/60 hover:text-white transition-colors"
                    >
                      Back to search
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="content"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex-1 flex flex-col overflow-hidden"
                  >
                    <header className="flex items-center justify-between gap-3 mb-5 shrink-0">
                      <button
                        type="button"
                        onClick={handleReset}
                        aria-label="Back to search"
                        className="p-2.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 transition-all active:scale-90 shrink-0"
                      >
                        <ArrowLeft className="w-5 h-5 text-white/60" aria-hidden="true" />
                      </button>

                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        {permalinkSlug && (
                          <Link
                            href={`/product/${encodeURIComponent(permalinkSlug)}`}
                            className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-emerald-400 transition-colors whitespace-nowrap"
                          >
                            <ExternalLink className="w-3 h-3" aria-hidden="true" /> Full page
                          </Link>
                        )}
                        <div className="flex items-center gap-1.5 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20 shrink-0">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                          <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400/80">AI Estimate</span>
                        </div>
                      </div>
                    </header>

                    <div className="flex-1 min-h-0 custom-scrollbar overflow-y-auto pr-1 pb-4">
                      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-4 lg:gap-8 items-start">
                        <div className="space-y-4 lg:space-y-5">
                          {identity && <ProductIdentity identity={identity} />}

                          {identity?.priceIndicator && (
                            <PriceMeter indicator={identity.priceIndicator} delay={0.4} />
                          )}
                        </div>

                        {alternatives.length > 0 && (
                          <AlternativeList
                            alternatives={alternatives}
                            onSelect={(model) => {
                              handleDecode(undefined, model);
                              setSearchQuery(model);
                            }}
                            delay={0.6}
                          />
                        )}
                      </div>
                    </div>

                    <p className="shrink-0 mt-1 text-[9px] sm:text-[10px] leading-relaxed text-white/60">
                      Specs and pricing are AI-estimated from public sources &mdash; verify before buying.
                    </p>

                    {/* Bottom "Another model..." bar (ported from the legacy result view) */}
                    <form onSubmit={handleBottomSubmit} className="mt-3 shrink-0 relative group">
                      <input
                        type="text"
                        placeholder="Another model..."
                        value={bottomQuery}
                        onChange={(e) => setBottomQuery(e.target.value.slice(0, MAX_MODEL_LENGTH))}
                        aria-label="Decode another model code"
                        maxLength={MAX_MODEL_LENGTH}
                        autoComplete="off"
                        enterKeyHint="search"
                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 pl-11 pr-[6.5rem] text-xs sm:text-sm text-white placeholder:text-white/40 outline-none focus:border-emerald-500/40 focus:bg-white/10 transition-all"
                      />
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 group-focus-within:text-emerald-400 transition-colors" aria-hidden="true" />
                      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={handleBottomPaste}
                          aria-label="Paste model code from clipboard"
                          className="p-2 rounded-lg bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/10 transition-colors"
                        >
                          <ClipboardPaste className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          type="submit"
                          disabled={!bottomQuery.trim()}
                          className="px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-[10px] border border-emerald-500/30 uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                        >
                          Decode
                        </button>
                      </div>
                    </form>
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
