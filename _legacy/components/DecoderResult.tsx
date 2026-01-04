
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle2, Box, Tag, Sparkles, 
  Loader2, ArrowLeft, Layers, Info,
  ShieldCheck, DollarSign, Search, ClipboardPaste
} from 'lucide-react';
import { DecodeResult } from '../types';
import { GoogleGenAI } from "@google/genai";

interface DecoderResultProps {
  model: string;
  onReset: () => void;
  onNewSearch: (query: string) => void;
}

const springConfig = { type: "spring", stiffness: 300, damping: 30, mass: 1 };

export const DecoderResult: React.FC<DecoderResultProps> = ({ model, onReset, onNewSearch }) => {
  const [result, setResult] = useState<DecodeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessageIdx, setLoadingMessageIdx] = useState(0);
  const [bottomSearch, setBottomSearch] = useState('');

  const loadingMessages = [
    "Identifying Category...",
    "Extracting DNA...",
    "Scanning Market...",
    "Comparing Alternatives...",
    "Analyzing Value..."
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setLoadingMessageIdx((prev) => (prev + 1) % loadingMessages.length);
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleAnalyze = async () => {
      setLoading(true);
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const systemPrompt = `
          You are a premium universal tech shopping decoder named TecRec. 
          Identify any piece of technology (cameras, monitors, SD cards, appliances, etc.) by its model code.
          
          CRITICAL: You MUST use Google Search to find the latest 2024/2025 specifications, street prices (US Market), and expert reviews.
          
          You MUST return the identification in a valid JSON format. 
          
          Price Indicator Logic:
          - level/percent mapping must be consistent:
            - 0-25%: "Value"
            - 26-50%: "Mid-Range"
            - 51-75%: "Premium"
            - 76-100%: "Elite"

          Alternative Selection Logic:
          - The "alternatives" list MUST ONLY include products from the EXACT SAME PRODUCT CATEGORY as the identified model.
          
          Expected JSON structure:
          {
            "identity": {
              "brand": "Brand Name",
              "category": "General Category (MAX 3 WORDS)", 
              "keySpecs": ["Spec 1", "Spec 2", "Spec 3"], 
              "year": "Model Age (Format: 'Q[1-4] YYYY')", 
              "insight": "Impactful purchasing insight",
              "priceIndicator": {
                "level": "Value | Mid-Range | Premium | Elite",
                "percent": 75,
                "estimatedPrice": "$1,499"
              }
            },
            "alternatives": [
              { "brand": "Brand", "model": "Model Name", "why": "Viable choice reasoning" }
            ]
          }
        `;

        const response = await ai.models.generateContent({
          model: 'gemini-flash-lite-latest',
          contents: `Decode this tech model using current 2025 web data and US pricing: ${model}`,
          config: {
            systemInstruction: systemPrompt,
            tools: [{ googleSearch: {} }],
          }
        });

        const text = response.text || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          try {
            setResult({
              ...JSON.parse(jsonMatch[0]),
              sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
            });
          } catch (e) {
            setResult({ error: "Data formatting error." });
          }
        } else {
          setResult({ error: "Could not find technical data." });
        }
      } catch (err) {
        setResult({ error: "Intelligence engine timeout." });
      } finally {
        setLoading(false);
      }
    };

    handleAnalyze();
  }, [model]);

  const handleBottomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (bottomSearch.trim()) {
      onNewSearch(bottomSearch);
      setBottomSearch('');
    }
  };

  const handleBottomPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setBottomSearch(text);
    } catch (err) {
      console.error('Failed to read clipboard content: ', err);
    }
  };

  return (
    <div className="liquid-glass specular-highlight rounded-[2rem] sm:rounded-[3rem] px-5 py-6 sm:px-10 sm:py-8 text-white h-full flex flex-col relative overflow-hidden">
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div 
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center justify-center text-center"
          >
            <motion.div
              animate={{ rotate: 360, scale: [1, 1.1, 1] }}
              transition={{ rotate: { repeat: Infinity, duration: 3, ease: "linear" }, scale: { repeat: Infinity, duration: 2 } }}
              className="mb-6 p-4 rounded-full bg-emerald-500/10 border border-emerald-500/20"
            >
              <Loader2 className="w-10 h-10 text-emerald-400" />
            </motion.div>
            <AnimatePresence mode="wait">
              <motion.p
                key={loadingMessageIdx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-base font-light text-white/40 tracking-wide"
              >
                {loadingMessages[loadingMessageIdx]}
              </motion.p>
            </AnimatePresence>
          </motion.div>
        ) : result?.error ? (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col items-center justify-center text-center">
            <Info className="w-10 h-10 text-red-400/50 mb-4" />
            <h3 className="text-xl font-bold mb-2">Decoding Failed</h3>
            <p className="text-white/40 text-xs mb-8 max-w-[220px]">{result.error}</p>
            <button onClick={onReset} className="px-10 py-3 rounded-xl bg-white/10 border border-white/20 font-bold text-[10px] tracking-widest uppercase">Try Again</button>
          </motion.div>
        ) : (
          <motion.div 
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <header className="flex items-center justify-between mb-5 shrink-0">
              <button onClick={onReset} className="p-2.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 transition-all active:scale-90">
                <ArrowLeft className="w-5 h-5 text-white/40" />
              </button>
              <div className="flex items-center gap-1.5 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400/80">Verified</span>
              </div>
              <div className="w-10" />
            </header>

            <div className="space-y-4 flex-1 custom-scrollbar overflow-y-auto pr-1 pb-4">
              <div className="grid grid-cols-2 gap-3">
                <motion.div 
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.1 }}
                  className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col gap-1"
                >
                  <div className="flex items-center gap-1.5 text-[8px] uppercase font-black tracking-widest text-white/20">
                    <Tag className="w-3 h-3" /> Brand
                  </div>
                  <div className="text-sm text-white font-bold truncate">{result?.identity?.brand}</div>
                </motion.div>
                
                <motion.div 
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.2 }}
                  className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col gap-1"
                >
                  <div className="flex items-center gap-1.5 text-[8px] uppercase font-black tracking-widest text-white/20">
                    <Box className="w-3 h-3" /> Category
                  </div>
                  <div className="text-sm text-white font-bold truncate">{result?.identity?.category}</div>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.3 }}
                  className="col-span-2 p-5 rounded-[1.5rem] bg-white/5 border border-white/5 flex flex-col gap-4"
                >
                  <div className="flex items-center gap-1.5 text-[8px] uppercase font-black tracking-widest text-white/20">
                    <Layers className="w-3.5 h-3.5" /> Technical DNA
                  </div>
                  <div className="grid gap-2.5">
                    {result?.identity?.keySpecs?.map((spec, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 text-xs text-white/80 font-semibold leading-snug">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{spec}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </div>

              {result?.identity?.priceIndicator && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...springConfig, delay: 0.4 }}
                  className="p-5 rounded-[1.5rem] bg-white/5 border border-white/5 relative overflow-hidden"
                >
                  <div className="flex justify-between items-end mb-4">
                    <div className="flex items-center gap-1.5 text-[8px] uppercase font-black tracking-[0.2em] text-white/20">
                      <DollarSign className="w-3.5 h-3.5" /> Market
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest block mb-0.5">
                        {result.identity.priceIndicator.level}
                      </span>
                      <span className="text-xl font-bold text-white tracking-tight">
                        {result.identity.priceIndicator.estimatedPrice}
                      </span>
                    </div>
                  </div>
                  
                  <div className="relative h-2 w-full bg-white/10 rounded-full mb-3">
                    <motion.div 
                      initial={{ width: 0 }} 
                      animate={{ width: `${result.identity.priceIndicator.percent}%` }}
                      transition={{ duration: 1.5, ease: "circOut", delay: 0.5 }}
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
              )}
                
              <motion.div 
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.5 }}
                className="p-5 rounded-[1.5rem] bg-emerald-500/10 border border-emerald-500/20 relative overflow-hidden"
              >
                <div className="flex items-center gap-1.5 text-[8px] uppercase font-black tracking-widest text-emerald-400 mb-3">
                  <Sparkles className="w-3.5 h-3.5" /> Verdict
                </div>
                <div className="text-white/80 leading-relaxed font-bold text-xs italic">
                  "{result?.identity?.insight}"
                </div>
              </motion.div>

              <div className="pt-6 border-t border-white/10">
                <h4 className="text-[8px] uppercase tracking-[0.3em] font-black text-white/20 mb-4 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" /> Alternatives
                </h4>
                <div className="grid gap-3">
                  {result?.alternatives?.map((alt, i) => (
                    <motion.button 
                      key={i} 
                      initial={{ opacity: 0, x: -10 }} 
                      animate={{ opacity: 1, x: 0 }} 
                      transition={{ delay: 0.6 + (i * 0.05) }}
                      onClick={() => onNewSearch(`${alt.brand} ${alt.model}`)}
                      className="p-4 text-left rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all active:scale-[0.98] group"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[7px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-1.5 py-0.5 rounded-md">{alt.brand}</span>
                        <span className="text-[11px] font-bold text-white/90 truncate">{alt.model}</span>
                      </div>
                      <p className="text-[9px] text-white/40 leading-snug line-clamp-2">{alt.why}</p>
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>
            
            <form onSubmit={handleBottomSubmit} className="mt-4 shrink-0 relative group">
              <input 
                type="text"
                placeholder="Another model..."
                value={bottomSearch}
                onChange={(e) => setBottomSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3.5 pl-10 pr-[5.5rem] text-[11px] text-white placeholder:text-white/20 outline-none focus:border-emerald-500/40 transition-all"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-emerald-400 transition-colors" />
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button type="button" onClick={handleBottomPaste} className="p-1.5 rounded-lg bg-white/5 text-white/20 hover:text-white hover:bg-white/10 border border-white/10">
                  <ClipboardPaste className="w-3.5 h-3.5" />
                </button>
                <button type="submit" className="px-3.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-[9px] border border-emerald-500/30 uppercase">
                  Decode
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
