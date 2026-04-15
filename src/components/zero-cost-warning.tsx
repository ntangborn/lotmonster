import { AlertTriangle } from 'lucide-react'

interface ZeroCostWarningProps {
  /** Number of ingredients/rows with no cost set. */
  count: number
  /** Word for the items, singular. Defaults to "ingredient". */
  noun?: string
}

/**
 * Yellow non-blocking banner shown when one or more items have no unit cost.
 * Renders nothing when count is 0.
 */
export function ZeroCostWarning({ count, noun = 'ingredient' }: ZeroCostWarningProps) {
  if (count === 0) return null

  const plural = count !== 1
  const nounLabel = plural ? `${noun}s` : noun

  return (
    <div className="flex items-start gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm">
      <AlertTriangle
        size={16}
        className="mt-0.5 shrink-0 text-yellow-400"
        aria-hidden
      />
      <p className="text-yellow-200">
        <span className="font-semibold">
          {count} {nounLabel}
        </span>{' '}
        {plural ? 'have' : 'has'} no unit cost — COGS won&apos;t be tracked until a cost is added.
        You can save now and update costs later.
      </p>
    </div>
  )
}
