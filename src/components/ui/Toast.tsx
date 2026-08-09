'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle, CheckCircle2, Info } from 'lucide-react';

export type ToastType = 'error' | 'success' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

const springConfig = { type: "spring", stiffness: 300, damping: 30, mass: 1 } as const;

/** Renders an animated toast with icon, message, and dismiss button. */
export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  const icons = {
    error: <AlertCircle className="w-5 h-5 text-red-400" />,
    success: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
    info: <Info className="w-5 h-5 text-blue-400" />,
  };

  const borders = {
    error: 'border-red-500/30',
    success: 'border-emerald-500/30',
    info: 'border-blue-500/30',
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 50, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 50, scale: 0.95 }}
      transition={springConfig}
      className={`liquid-glass specular-highlight rounded-2xl px-5 py-4 text-white flex items-start gap-3 min-w-[300px] max-w-[400px] border ${borders[toast.type]} shadow-lg`}
    >
      <div className="shrink-0 mt-0.5">
        {icons[toast.type]}
      </div>
      <p className="text-sm font-medium flex-1 leading-snug">
        {toast.message}
      </p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 p-1 rounded-lg hover:bg-white/10 transition-colors text-white/40 hover:text-white"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
};

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

/** Fix top-right container displaying all active toasts. */
export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed z-50 flex flex-col gap-3 pointer-events-none pr-safe" style={{ top: "calc(env(safe-area-inset-top) + 1rem)", right: "1rem" }}>
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast toast={toast} onDismiss={onDismiss} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
};
