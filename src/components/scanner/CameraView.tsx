'use client';

import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ScanBarcode, Loader2, Sparkles } from 'lucide-react';

interface CameraViewProps {
    isOpen: boolean;
    onClose: () => void;
    onCapture: (imageData: string) => void;
    isScanning: boolean;
}

export const CameraView: React.FC<CameraViewProps> = ({ isOpen, onClose, onCapture, isScanning }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        let stream: MediaStream | null = null;

        if (isOpen) {
            (async () => {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: 'environment' }
                    });
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                    }
                } catch (err) {
                    console.error("Error accessing camera:", err);
                    onClose();
                    alert("Camera access denied or not available.");
                }
            })();
        }

        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [isOpen]);

    const handleCapture = () => {
        if (!videoRef.current || !canvasRef.current || isScanning) return;

        const canvas = canvasRef.current;
        const video = videoRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');

        if (ctx) {
            ctx.drawImage(video, 0, 0);
            try {
                const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                onCapture(base64Image);
            } catch (e) {
                console.error("Capture error", e);
            }
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/90 backdrop-blur-2xl"
                >
                    <motion.div
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.9, y: 20 }}
                        className="liquid-glass specular-highlight w-full max-w-[380px] rounded-[2.5rem] overflow-hidden p-6 text-white flex flex-col gap-6"
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                                    <ScanBarcode className="w-5 h-5" />
                                </div>
                                <h3 className="text-base font-bold">Store Scanner</h3>
                            </div>
                            <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                                <X className="w-5 h-5 text-white/50" />
                            </button>
                        </div>

                        <div className="relative aspect-[4/5] sm:aspect-[4/3] rounded-[1.8rem] overflow-hidden bg-black flex items-center justify-center scanner-frame">
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                className="w-full h-full object-cover"
                            />
                            <div className="scanner-line" />
                            <div className="absolute inset-0 border-[30px] border-black/40 pointer-events-none" />

                            {isScanning && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-md z-20">
                                    <Loader2 className="w-10 h-10 text-emerald-400 animate-spin mb-3" />
                                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">Analyzing Label...</span>
                                </div>
                            )}
                        </div>

                        <div className="text-center px-2">
                            <p className="text-[11px] text-white/40 mb-5 leading-relaxed font-medium">Position the label within the frame for identification.</p>
                            <button
                                onClick={handleCapture}
                                disabled={isScanning}
                                className="w-full py-6 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white text-lg font-bold shadow-[0_15px_30px_-5px_rgba(52,211,153,0.4)] active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-3 border border-emerald-300/30"
                            >
                                {isScanning ? (
                                    <>
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                        Wait...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-6 h-6" />
                                        Capture & Identify
                                    </>
                                )}
                            </button>
                        </div>
                    </motion.div>

                    <canvas ref={canvasRef} className="hidden" />
                </motion.div>
            )}
        </AnimatePresence>
    );
};
