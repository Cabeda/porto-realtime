"use client";

/**
 * Small "?" button that shows a tooltip explaining a metric.
 * Uses CSS-only hover + focus-visible so it works without JS state.
 */
export function MetricTooltip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex items-center group">
      <button
        type="button"
        aria-label="Explicação da métrica"
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
      {/* Tooltip bubble */}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50
          w-56 rounded-lg px-3 py-2 text-xs leading-relaxed
          bg-[var(--color-surface-raised)] border border-[var(--color-border)] shadow-lg
          text-[var(--color-content)]
          opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100
          group-focus-within:opacity-100 group-focus-within:scale-100
          transition-all duration-150 origin-bottom"
      >
        {text}
        {/* Arrow */}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[var(--color-border)]" />
      </span>
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
