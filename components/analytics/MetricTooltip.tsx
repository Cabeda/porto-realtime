"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "@/lib/hooks/useTranslations";

interface TooltipPos {
  top: number;
  left: number;
  placement: "top" | "bottom";
}

/**
 * Small "?" button that shows a tooltip explaining a metric.
 * Uses createPortal so the bubble renders on document.body and is never
 * clipped by overflow:hidden ancestors (e.g. table wrappers).
 */
export function MetricTooltip({ text }: { text: string }) {
  const [pos, setPos] = useState<TooltipPos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const show = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    // Place above if button is in the lower half of the viewport, below otherwise
    const placement: "top" | "bottom" = r.top > window.innerHeight / 2 ? "top" : "bottom";
    setPos({
      top: placement === "top" ? r.top + window.scrollY : r.bottom + window.scrollY,
      left: r.left + r.width / 2 + window.scrollX,
      placement,
    });
  }, []);

  const hide = useCallback(() => setPos(null), []);

  const bubble =
    pos && mounted
      ? createPortal(
          <span
            role="tooltip"
            style={{
              position: "absolute",
              top: pos.placement === "top" ? pos.top - 8 : pos.top + 8,
              left: pos.left,
              transform: pos.placement === "top" ? "translate(-50%, -100%)" : "translate(-50%, 0)",
            }}
            className="pointer-events-none z-[9999] w-56 rounded-lg px-3 py-2 text-xs leading-relaxed
        bg-[var(--color-surface-raised)] border border-[var(--color-border)] shadow-lg
        text-[var(--color-content)]"
          >
            {text}
            {pos.placement === "top" ? (
              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[var(--color-border)]" />
            ) : (
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-[var(--color-border)]" />
            )}
          </span>,
          document.body
        )
      : null;

  return (
    <span className="inline-flex items-center">
      <button
        ref={btnRef}
        type="button"
        aria-label="Explicação da métrica"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className="ml-1 w-4 h-4 rounded-full text-[10px] font-bold leading-none
          flex items-center justify-center
          bg-[var(--color-border)] text-[var(--color-content-secondary)]
          hover:bg-[var(--color-accent)] hover:text-white
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]
          transition-colors cursor-default"
        tabIndex={0}
      >
        ?
      </button>
      {bubble}
    </span>
  );
}

/** Hook returning localised metric tip strings */
export function useMetricTips() {
  const t = useTranslations();
  return t.metricTips;
}
