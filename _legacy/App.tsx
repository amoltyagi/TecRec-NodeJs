
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DecoderResult } from './components/DecoderResult';
import { Search, Cpu, ClipboardPaste, Camera, X, Loader2, Sparkles, ScanBarcode } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

const springConfig = { type: "spring", stiffness: 300, damping: 30, mass: 1 };

const App: React.FC = () => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeModel, setActiveModel] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleDecode = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;
    setActiveModel(searchQuery);
    setIsAnalyzing(true);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setSearchQuery(text);
    } catch (err) {
      console.error('Failed to read clipboard contents: ', err);
    }
  };

  const startCamera = async () => {
    setIsCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setIsCameraOpen(false);
      alert("Camera access denied or not available.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
    }
    setIsCameraOpen(false);
  };

  const captureAndScan = async () => {
    if (!videoRef.current || !canvasRef.current || isScanning) return;
    
    setIsScanning(true);
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: {
            parts: [
              { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
              { text: "Extract the technology product model number or name from this price tag or product label. Return ONLY the model/name string. If nothing found, return 'None'." }
            ]
          }
        });

        const extracted = response.text?.trim();
        if (extracted && extracted.toLowerCase() !== 'none') {
          setSearchQuery(extracted);
          setActiveModel(extracted);
          setIsAnalyzing(true);
          stopCamera();
        } else {
          alert("Could not clearly identify a model number. Please try closer or adjust lighting.");
        }
      } catch (err) {
        console.error("Scanning error:", err);
      } finally {
        setIsScanning(false);
      }
    }
  };

  const handleNewSearch = (newQuery: string) => {
    if (!newQuery.trim()) return;
    setActiveModel(newQuery);
    setSearchQuery(newQuery);
    setIsAnalyzing(true);
  };

  const handleReset = () => {
    setIsAnalyzing(false);
    setActiveModel('');
    setSearchQuery('');
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-start sm:justify-center overflow-hidden p-4 sm:p-6 pt-12 sm:pt-6 font-sans antialiased">
      <style>{`
        .aurora-container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          z-index: -1;
          background: #020617;
          overflow: hidden;
        }
        .aurora-blob {
          position: absolute;
          width: 80vw;
          height: 80vw;
          border-radius: 50%;
          filter: blur(100px);
          opacity: 0.35;
          mix-blend-mode: screen;
        }
        .blob-1 {
          background: radial-gradient(circle, #3b82f6 0%, transparent 70%);
          top: -15%;
          left: -15%;
          animation: drift 25s infinite alternate ease-in-out;
        }
        .blob-2 {
          background: radial-gradient(circle, #10b981 0%, transparent 70%);
          bottom: -15%;
          right: -15%;
          animation: drift 30s infinite alternate-reverse ease-in-out;
        }
        .blob-3 {
          background: radial-gradient(circle, #8b5cf6 0%, transparent 70%);
          top: 20%;
          right: -10%;
          animation: drift 22s infinite alternate ease-in-out;
        }
        @keyframes drift {
          0% { transform: translate(0, 0) scale(1); }
          100% { transform: translate(15%, 10%) scale(1.25); }
        }
        .liquid-glass {
          backdrop-filter: blur(40px) saturate(210%);
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.22);
          box-shadow: 
            0 30px 60px -15px rgba(0, 0, 0, 0.6),
            inset 0 1px 1px rgba(255, 255, 255, 0.12);
        }
        .specular-highlight {
          position: relative;
        }
        .specular-highlight::before {
          content: "";
          position: absolute;
          top: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.45), transparent);
          z-index: 10;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.12);
          border-radius: 10px;
        }
        .scanner-frame {
          border: 2px solid rgba(52, 211, 153, 0.5);
          box-shadow: 0 0 20px rgba(52, 211, 153, 0.25);
        }
        .scanner-line {
          height: 2px;
          background: #10b981;
          box-shadow: 0 0 15px #10b981;
          width: 100%;
          position: absolute;
          animation: scan 2.5s infinite ease-in-out;
          z-index: 10;
        }
        @keyframes scan {
          0%, 100% { top: 15%; opacity: 0; }
          50% { top: 85%; opacity: 1; }
        }
      `}</style>

      <div className="aurora-container">
        <div className="aurora-blob blob-1" />
        <div className="aurora-blob blob-2" />
        <div className="aurora-blob blob-3" />
      </div>
      
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

              <form onSubmit={handleDecode} className="relative group mb-8 w-full">
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
                  onClick={startCamera}
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
                        setActiveModel(suggestion);
                        setIsAnalyzing(true);
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
            <DecoderResult model={activeModel} onReset={handleReset} onNewSearch={handleNewSearch} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCameraOpen && (
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
                <button onClick={stopCamera} className="p-2 rounded-full hover:bg-white/10 transition-colors">
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
                  onClick={captureAndScan}
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
          </motion.div>
        )}
      </AnimatePresence>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default App;
