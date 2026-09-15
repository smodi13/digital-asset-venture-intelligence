"use client";

import type { ReactNode } from "react";
import { useReveal } from "@/components/hooks/useReveal";

/**
 * Progressive-enhancement entrance wrapper. Renders a plain <div> that is fully
 * visible with no JavaScript; useReveal only adds a one-time fade/rise when the
 * browser supports it and the person has not asked for reduced motion.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
