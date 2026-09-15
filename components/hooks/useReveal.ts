"use client";

import { useEffect, useRef } from "react";

/**
 * Progressive-enhancement reveal.
 *
 * The element is fully visible in server HTML and base CSS. Only after mount,
 * and only when the browser supports IntersectionObserver and the person has
 * not asked for reduced motion, does this add a one-time entrance transition.
 * If anything is missing the element simply stays visible - content is never
 * gated behind JavaScript.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion || typeof IntersectionObserver !== "function") return;

    // Apply the pre-reveal state now (post-mount), then transition it in. Doing
    // this after mount avoids any hydration mismatch or flash of hidden content.
    el.dataset.reveal = "pending";

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.dataset.reveal = "shown";
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    observer.observe(el);

    // Safety net: reveal within a beat even if the observer never fires.
    const timer = window.setTimeout(() => {
      el.dataset.reveal = "shown";
      observer.disconnect();
    }, 600);

    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  return ref;
}
