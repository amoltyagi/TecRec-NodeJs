'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ScanBarcode, Loader2, Sparkles } from 'lucide-react';
import { useToast } from '@/context/ToastContext';

interface CameraViewProps {
    isOpen: boolean;
    onClose: () => void;
    onCapture: (imageData: string) => void;
    isScanning: boolean;
}

/** Longest edge sent to the API. Keeps the base64 payload far below the 5MB cap. */
const MAX_CAPTURE_EDGE = 1600;
const JPEG_QUALITY = 0.85;
const DIALOG_TITLE_ID = 'camera-dialog-title';
const DIALOG_HINT_ID = 'camera-dialog-hint';

export const CameraView: React.FC<CameraViewProps> = ({ isOpen, onClose, onCapture, isScanning }) => {
    const { showError } = useToast();
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const previouslyFocusedRef = useRef<HTMLElement | null>(null);

    // Keep the latest callbacks in refs: the stream effect must run only when the
    // modal opens/closes, not every time a parent re-render produces new callbacks.
    const onCloseRef = useRef(onClose);
    const showErrorRef = useRef(showError);
    useEffect(() => {
        onCloseRef.current = onClose;
        showErrorRef.current = showError;
    });

    useEffect(() => {
        if (!isOpen) return;

        // `cancelled` covers the race where the modal closes (or a newer open
        // supersedes this one) before getUserMedia resolves: the stream would
        // otherwise keep the camera light on until the tab is closed.
        let cancelled = false;
        let stream: MediaStream | null = null;
        // Captured at effect setup: the ref may already have changed by cleanup.
        const video = videoRef.current;

        const start = async () => {
            if (!navigator.mediaDevices?.getUserMedia) {
                showErrorRef.current('Camera is not available in this browser.');
                onCloseRef.current();
                return;
            }

            try {
                const mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' },
                });

                if (cancelled) {
                    mediaStream.getTracks().forEach((track) => track.stop());
                    return;
                }

                stream = mediaStream;
                if (video) {
                    video.srcObject = mediaStream;
                    // iOS Safari only starts playback after an explicit play() call.
                    void video.play().catch(() => {
                        /* Autoplay can still be blocked; the preview then stays on the first frame. */
                    });
                }
            } catch (err) {
                if (cancelled) return;
                console.error('Error accessing camera:', err);
                onCloseRef.current();
                showErrorRef.current('Camera access denied or not available.');
            }
        };

        void start();

        return () => {
            cancelled = true;
            if (stream) {
                stream.getTracks().forEach((track) => track.stop());
                stream = null;
            }
            if (video) {
                video.srcObject = null;
            }
        };
    }, [isOpen]);

    // Dialog behaviour: focus the close button on open, close on Escape, keep Tab
    // inside the modal, and hand focus back to the trigger on close.
    useEffect(() => {
        if (!isOpen) return;

        previouslyFocusedRef.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;

        const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 50);

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onCloseRef.current();
                return;
            }
            if (event.key !== 'Tab') return;

            const root = dialogRef.current;
            if (!root) return;

            const focusable = Array.from(
                root.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                )
            );
            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = document.activeElement;

            // Focus escaped the modal (or the previously focused control became
            // disabled): pull it back inside before cycling.
            if (!active || !focusable.includes(active as HTMLElement)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
                return;
            }

            if (event.shiftKey && active === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            window.clearTimeout(focusTimer);
            const previous = previouslyFocusedRef.current;
            previouslyFocusedRef.current = null;
            if (previous && document.contains(previous)) {
                previous.focus();
            }
        };
    }, [isOpen]);

    const handleCapture = useCallback(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || isScanning) return;

        // Safari/iOS can report a frame size of 0 before the first frame is
        // decoded; drawing then uploads a blank image and wastes a decode.
        if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
            showErrorRef.current('Camera is still starting. Hold steady and try again.');
            return;
        }

        // Downscale so the longest edge never exceeds MAX_CAPTURE_EDGE.
        const longestEdge = Math.max(video.videoWidth, video.videoHeight);
        const scale = longestEdge > MAX_CAPTURE_EDGE ? MAX_CAPTURE_EDGE / longestEdge : 1;
        const width = Math.max(1, Math.round(video.videoWidth * scale));
        const height = Math.max(1, Math.round(video.videoHeight * scale));

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            showErrorRef.current('Could not capture the image. Please try again.');
            return;
        }

        ctx.drawImage(video, 0, 0, width, height);

        try {
            const base64Image = canvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1];
            if (!base64Image) {
                showErrorRef.current('Could not capture the image. Please try again.');
                return;
            }
            onCapture(base64Image);
        } catch (e) {
            console.error('Capture error', e);
            showErrorRef.current('Could not capture the image. Please try again.');
        }
    }, [isScanning, onCapture]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center pt-safe pb-safe px-safe sm:p-6 bg-black/90 backdrop-blur-2xl"
                >
                    <motion.div
                        ref={dialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={DIALOG_TITLE_ID}
                        aria-describedby={DIALOG_HINT_ID}
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.9, y: 20 }}
                        className="liquid-glass specular-highlight w-full max-w-none sm:max-w-[380px] rounded-none sm:rounded-[2.5rem] overflow-hidden p-6 sm:p-6 text-white flex flex-col gap-6 sm:gap-6"
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                                    <ScanBarcode className="w-5 h-5" aria-hidden="true" />
                                </div>
                                <h3 id={DIALOG_TITLE_ID} className="text-base font-bold">Store Scanner</h3>
                            </div>
                            <button
                                ref={closeButtonRef}
                                type="button"
                                onClick={onClose}
                                aria-label="Close scanner"
                                className="p-2 rounded-full hover:bg-white/10 transition-colors"
                            >
                                <X className="w-5 h-5 text-white/60" aria-hidden="true" />
                            </button>
                        </div>

                        <div className="relative w-full flex-1 min-h-0 sm:flex-none sm:aspect-[4/3] rounded-[1.8rem] overflow-hidden bg-black flex items-center justify-center scanner-frame">
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-full object-cover"
                            />
                            <div className="scanner-line" />
                            <div className="absolute inset-0 border-[30px] border-black/40 pointer-events-none" />

                            {isScanning && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-md z-20">
                                    <Loader2 className="w-10 h-10 text-emerald-400 animate-spin mb-3" aria-hidden="true" />
                                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">Analyzing Label...</span>
                                </div>
                            )}
                        </div>

                        <div className="text-center px-2">
                            <p id={DIALOG_HINT_ID} className="text-[11px] text-white/60 mb-5 leading-relaxed font-medium">Position the label within the frame for identification.</p>
                            <button
                                type="button"
                                onClick={handleCapture}
                                disabled={isScanning}
                                className="w-full py-6 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white text-lg font-bold shadow-[0_15px_30px_-5px_rgba(52,211,153,0.4)] active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-3 border border-emerald-300/30"
                            >
                                {isScanning ? (
                                    <>
                                        <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
                                        Wait...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-6 h-6" aria-hidden="true" />
                                        Capture & Identify
                                    </>
                                )}
                            </button>
                        </div>
                    </motion.div>

                    <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
                </motion.div>
            )}
        </AnimatePresence>
    );
};
