/**
 * Civic escalation helpers (#48)
 *
 * Tier 2 (~25 votes): Portal da Queixa — public reputational pressure
 * Tier 3 (~50 votes): Livro de Reclamações — legally binding, 15-day response
 */

export const TIER2_THRESHOLD = 25;
export const TIER3_THRESHOLD = 50;

export type EscalationTier = 2 | 3;

export function getEscalationTier(voteCount: number): EscalationTier | null {
  if (voteCount >= TIER3_THRESHOLD) return 3;
  if (voteCount >= TIER2_THRESHOLD) return 2;
  return null;
}

/** Portal da Queixa STCP brand page */
export const PORTAL_QUEIXA_URL =
  "https://portaldaqueixa.com/brands/stcp-sociedade-de-transportes-colectivos-do-porto-s-a";

/** Livro de Reclamações online form */
export const LIVRO_RECLAMACOES_URL =
  "https://www.livroreclamacoes.pt/Pedido/Reclamacao";

/**
 * Build a pre-filled complaint context string users can paste into external forms.
 * Includes type, target, rating, tags, and comment.
 */
export function buildComplaintContext(opts: {
  type: string;
  targetId: string;
  rating: number;
  comment: string | null;
  tags: string[];
  voteCount: number;
  createdAt: string;
}): string {
  const typeLabel =
    opts.type === "LINE"
      ? `Line ${opts.targetId}`
      : opts.type === "STOP"
        ? `Stop ${opts.targetId}`
        : opts.type === "VEHICLE"
          ? `Vehicle ${opts.targetId}`
          : opts.type === "BIKE_PARK"
            ? `Bike park ${opts.targetId}`
            : `Bike lane ${opts.targetId}`;

  const date = new Date(opts.createdAt).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const tagStr =
    opts.tags.length > 0 ? `Issues reported: ${opts.tags.join(", ")}. ` : "";

  const commentStr = opts.comment ? `"${opts.comment}" ` : "";

  return (
    `Porto public transit complaint — ${typeLabel}. ` +
    `Rating: ${opts.rating}/5. ` +
    tagStr +
    commentStr +
    `Reported on ${date} via PortoMove (portomove.pt). ` +
    `${opts.voteCount} community members agree with this report.`
  );
}
