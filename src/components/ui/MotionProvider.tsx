'use client';

import React from 'react';
import { MotionConfig } from 'framer-motion';

interface MotionProviderProps {
  children: React.ReactNode;
}

/**
 * Applies the user's system motion preference to every framer-motion animation.
 *
 * With `reducedMotion="user"`, framer-motion drops transform/layout animations
 * when the OS reports `prefers-reduced-motion: reduce` while keeping opacity and
 * color transitions. The CSS-side counterpart lives in globals.css.
 */
export const MotionProvider: React.FC<MotionProviderProps> = ({ children }) => (
  <MotionConfig reducedMotion="user">{children}</MotionConfig>
);
