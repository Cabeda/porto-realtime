"use client";

/**
 * Rating distribution bar chart — shows count per star level.
 * Expects `distribution` as [1star, 2star, 3star, 4star, 5star] from the API.
 */
export function RatingDistribution({ distribution, total }: { distribution: number[]; total: number }) {
  const maxCount = Math.max(...distribution, 1);

  return (
    <div className="bg-surface-raised rounded-lg shadow-md p-4">
      <h2 className="text-sm font-semibold text-content-secondary mb-3">
        Distribuição ({total} total)
      </h2>
      <div className="space-y-1.5">
        {[5, 4, 3, 2, 1].map((star) => (
          <div key={star} className="flex items-center gap-2">
            <span className="text-xs text-content-muted w-3 text-right">{star}</span>
            <span className="text-yellow-400 text-xs">★</span>
            <div className="flex-1 h-2 bg-surface-sunken rounded-full overflow-hidden">
              <div
                className="h-full bg-yellow-400 rounded-full transition-all"
                style={{ width: `${(distribution[star - 1] / maxCount) * 100}%` }}
              />
            </div>
            <span className="text-xs text-content-muted w-6 text-right">
              {distribution[star - 1]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
