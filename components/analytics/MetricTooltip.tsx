"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

interface TooltipPos { top: number; left: number }

/**
 * Small "?" button that shows a tooltip explaining a metric.
 * Uses createPortal so the bubble renders on document.body and is never
 * clipped by overflow:hidden ancestors (e.g. table wrappers).
 */
export function MetricTooltip({ text }: { text: string }) {
  const [pos, setPos] = useState<TooltipPos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const show = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.top + window.scrollY, left: r.left + r.width / 2 + window.scrollX });
  }, []);

  const hide = useCallback(() => setPos(null), []);

  const bubble = pos && mounted ? createPortal(
    <span
      role="tooltip"
      style={{ position: "absolute", top: pos.top - 8, left: pos.left, transform: "translate(-50%, -100%)" }}
      className="pointer-events-none z-[9999] w-56 rounded-lg px-3 py-2 text-xs leading-relaxed
        bg-[var(--color-surface-raised)] border border-[var(--color-border)] shadow-lg
        text-[var(--color-content)]"
    >
      {text}
      <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[var(--color-border)]" />
    </span>,
    document.body
  ) : null;

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

/** All metric explanations in plain Portuguese */
export const METRIC_TIPS = {
  activeBuses:
    "Número de autocarros da STCP detetados em circulação. Atualizado a cada 30 segundos.",
  networkSpeed:
    "Velocidade comercial média de todos os autocarros em serviço, incluindo paragens e tráfego. Valores abaixo de 10 km/h indicam congestionamento grave.",
  ewt: "Tempo de Espera Excessivo (EWT): tempo extra que um passageiro espera além do intervalo previsto entre autocarros. Zero significa que os autocarros chegam exatamente como planeado. Quanto menor, melhor.",
  worstLine:
    "A linha com maior tempo de espera excessivo no período selecionado — ou seja, a que mais atrasa os passageiros.",
  headwayAdherence:
    "Percentagem de viagens em que o intervalo entre autocarros foi cumprido conforme o planeado. 100% significa pontualidade perfeita; valores baixos indicam irregularidade.",
  bunching:
    "Percentagem de viagens em que dois autocarros da mesma linha chegaram muito próximos um do outro (\"comboio de autocarros\"). Acontece quando um autocarro atrasa e o seguinte o apanha. Quanto menor, melhor.",
  gapping:
    "Percentagem de viagens em que o intervalo entre autocarros foi muito maior do que o previsto, deixando passageiros à espera por muito tempo. Quanto menor, melhor.",
  grade:
    "Nota geral da linha de A (excelente) a F (mau), calculada com base no tempo de espera excessivo e na aderência ao intervalo.",
  speed:
    "Velocidade comercial média da linha, incluindo paragens. Reflete a rapidez real do serviço no percurso.",
  trips:
    "Número de viagens completas observadas no período selecionado.",
} as const;
