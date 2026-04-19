'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Search,
  Loader2,
  AlertCircle,
  Package,
  Factory,
  ShoppingBag,
  ArrowRight,
  Info,
  ChevronRight,
} from 'lucide-react'
import type {
  ForwardTraceResult,
  ReverseTraceResult,
  RunTraceResult,
} from '@/lib/traceability'

type Kind = 'lot' | 'run' | 'order'
type ResultData =
  | { kind: 'lot'; result: ForwardTraceResult }
  | { kind: 'run'; result: RunTraceResult }
  | { kind: 'order'; result: ReverseTraceResult }

function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString()
}
function fmtNum(n: number, digits = 4): string {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString(undefined, { maximumFractionDigits: digits })
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-white/10 text-white/60',
  confirmed: 'bg-blue-500/10 text-blue-300',
  shipped: 'bg-yellow-500/10 text-yellow-300',
  closed: 'bg-emerald-500/10 text-emerald-300',
  cancelled: 'bg-red-500/10 text-red-300',
  planned: 'bg-blue-500/10 text-blue-300',
  in_progress: 'bg-yellow-500/10 text-yellow-300',
  completed: 'bg-emerald-500/10 text-emerald-300',
}

export function TraceSearch({
  initialQuery,
  initialType,
}: {
  initialQuery: string
  initialType: Kind
}) {
  const [type, setType] = useState<Kind>(initialType)
  const [q, setQ] = useState(initialQuery)
  const [data, setData] = useState<ResultData | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function run() {
    const v = q.trim()
    if (!v) {
      setData(null)
      return
    }
    setLoading(true)
    setErr('')
    const params = new URLSearchParams({ [type]: v })
    try {
      const res = await fetch(`/api/traceability?${params}`)
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        setErr(e.error ?? 'Trace failed')
        setData(null)
      } else {
        const json = (await res.json()) as ResultData
        setData(json)
      }
    } catch {
      setErr('Network error')
    } finally {
      setLoading(false)
    }

    const url = new URL(window.location.href)
    url.searchParams.set('q', v)
    url.searchParams.set('type', type)
    window.history.replaceState({}, '', url.toString())
  }

  useEffect(() => {
    if (initialQuery) run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-3 flex flex-wrap gap-2">
          <KindChip active={type === 'lot'} onClick={() => setType('lot')}>
            <Package size={12} /> Lot Number
          </KindChip>
          <KindChip active={type === 'run'} onClick={() => setType('run')}>
            <Factory size={12} /> Run Number
          </KindChip>
          <KindChip active={type === 'order'} onClick={() => setType('order')}>
            <ShoppingBag size={12} /> Order Number
          </KindChip>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            run()
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
            />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={
                type === 'lot'
                  ? 'CAY-20260415-001'
                  : type === 'run'
                    ? 'PR-2026-001'
                    : 'SO-2026-001'
              }
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 font-mono text-sm text-white placeholder:text-white/30 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !q.trim()}
            className="flex items-center gap-2 rounded-lg bg-teal-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-400 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Search size={14} />
            )}
            Trace
          </button>
        </form>
      </div>

      {err && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle size={14} />
          {err}
        </div>
      )}

      {data?.kind === 'lot' && <ForwardView result={data.result} />}
      {data?.kind === 'run' && <RunView result={data.result} />}
      {data?.kind === 'order' && <ReverseView result={data.result} />}
    </>
  )
}

function KindChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'border-teal-400 bg-teal-500/15 text-teal-300'
          : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  )
}

// ─── Forward view: lot → runs → SOs ──────────────────────────────────────────

function ForwardView({ result }: { result: ForwardTraceResult }) {
  if (!result.lot) {
    return <NotFound label={`No lot found with number "${result.query}"`} />
  }

  // Finished-goods lot: short chain — just the lot and the SOs that shipped it.
  if (result.lot.kind === 'finished') {
    return (
      <div className="space-y-4">
        <Stage
          icon={<Package size={14} />}
          title="Source Lot (finished goods)"
          accent="sky"
          intro={`Trace forward from finished-goods lot ${result.lot.lot_number}.`}
        >
          <LotCard lot={result.lot} />
        </Stage>

        <FlowArrow />

        <Stage
          icon={<ShoppingBag size={14} />}
          title={`Shipped to ${new Set(result.shipped_in.map((s) => s.id)).size} customer order${result.shipped_in.length === 1 ? '' : 's'}`}
          accent="emerald"
        >
          {result.shipped_in.length === 0 ? (
            <p className="text-xs text-white/40">
              This finished lot hasn&apos;t been shipped on any sales order yet.
            </p>
          ) : (
            <div className="space-y-2">
              {result.shipped_in.map((s) => (
                <SOCard key={`${s.id}-${s.matched_via}`} so={s} />
              ))}
            </div>
          )}
        </Stage>
      </div>
    )
  }

  // Raw-ingredient lot: full chain — raw → runs → finished goods → SOs.
  return (
    <div className="space-y-4">
      <Stage
        icon={<Package size={14} />}
        title="Source Lot (raw)"
        accent="emerald"
        intro={`Trace forward from ingredient lot ${result.lot.lot_number}.`}
      >
        <LotCard lot={result.lot} />
      </Stage>

      <FlowArrow />

      <Stage
        icon={<Factory size={14} />}
        title={`Used in ${result.consumed_in_runs.length} production run${result.consumed_in_runs.length === 1 ? '' : 's'}`}
        accent="blue"
      >
        {result.consumed_in_runs.length === 0 ? (
          <p className="text-xs text-white/40">
            This lot has not been consumed by any production run yet.
          </p>
        ) : (
          <div className="space-y-2">
            {result.consumed_in_runs.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <Link
                    href={`/dashboard/production-runs/${r.id}`}
                    className="font-mono text-teal-300 hover:text-teal-200"
                  >
                    {r.run_number}
                  </Link>
                  <StatusPill status={r.status} />
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-white/60">
                  <span>{r.recipe_name}</span>
                  <span className="font-mono">
                    used {fmtNum(r.quantity_used)} {r.unit}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-white/40">
                  Completed {fmtDate(r.completed_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Stage>

      <FlowArrow />

      <Stage
        icon={<Package size={14} />}
        title={`Produced ${result.produced_finished_lots.length} finished-goods lot${result.produced_finished_lots.length === 1 ? '' : 's'}`}
        accent="sky"
      >
        {result.produced_finished_lots.length === 0 ? (
          <p className="text-xs text-white/40">
            No finished-goods lots have been produced yet from the runs that
            consumed this lot.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {result.produced_finished_lots.map((fl) => (
              <FinishedLotCard key={fl.id} lot={fl} />
            ))}
          </div>
        )}
      </Stage>

      <FlowArrow />

      <Stage
        icon={<ShoppingBag size={14} />}
        title={`Shipped to ${new Set(result.shipped_in.map((s) => s.id)).size} customer order${result.shipped_in.length === 1 ? '' : 's'}`}
        accent="emerald"
      >
        {result.shipped_in.length === 0 ? (
          <p className="text-xs text-white/40">
            No sales orders reference this lot or its downstream finished goods.
          </p>
        ) : (
          <div className="space-y-2">
            {result.shipped_in.map((s) => (
              <SOCard key={`${s.id}-${s.matched_via}`} so={s} />
            ))}
          </div>
        )}
      </Stage>
    </div>
  )
}

function FinishedLotCard({ lot }: { lot: ForwardTraceResult['lot'] }) {
  if (!lot) return null
  return (
    <div className="rounded-lg border border-sky-500/30 bg-sky-500/[0.06] p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-mono text-white">{lot.lot_number}</span>
        <span className="font-mono text-xs text-white/60">
          {lot.unit}
        </span>
      </div>
      <p className="mt-1 text-sky-200">
        {lot.sku_id ? (
          <Link
            href={`/dashboard/skus/${lot.sku_id}`}
            className="hover:text-sky-100"
          >
            {lot.sku_name ?? 'SKU'}
          </Link>
        ) : (
          lot.sku_name ?? 'SKU'
        )}
      </p>
      <div className="mt-1 text-[11px] text-white/40">
        {lot.production_run_number && (
          <span>
            Run{' '}
            <Link
              href={`/dashboard/production-runs/${lot.production_run_id}`}
              className="font-mono text-sky-300/80 hover:text-sky-200"
            >
              {lot.production_run_number}
            </Link>
            {' · '}
          </span>
        )}
        Expiry {fmtDate(lot.expiry_date)}
      </div>
    </div>
  )
}

// ─── Run view: run → consumed lots + downstream SOs ──────────────────────────

function RunView({ result }: { result: RunTraceResult }) {
  if (!result.run) {
    return <NotFound label={`No run found with number "${result.query}"`} />
  }
  return (
    <div className="space-y-4">
      <Stage
        icon={<Factory size={14} />}
        title="Production Run"
        accent="blue"
        intro={`Tracing run ${result.run.run_number}.`}
      >
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <div className="flex items-center justify-between text-sm">
            <Link
              href={`/dashboard/production-runs/${result.run.id}`}
              className="font-mono text-teal-300 hover:text-teal-200"
            >
              {result.run.run_number}
            </Link>
            <StatusPill status={result.run.status} />
          </div>
          <p className="mt-1 text-sm text-white/70">{result.run.recipe_name}</p>
          <p className="mt-1 text-xs text-white/40">
            Completed {fmtDate(result.run.completed_at)}
          </p>
        </div>
      </Stage>

      <FlowArrow direction="up" label="Made from" />

      <Stage
        icon={<Package size={14} />}
        title={`${result.consumed_lots.length} ingredient lot${result.consumed_lots.length === 1 ? '' : 's'} consumed`}
        accent="teal"
      >
        {result.consumed_lots.length === 0 ? (
          <p className="text-xs text-white/40">No lots recorded.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {result.consumed_lots.map((l) => (
              <div
                key={l.id}
                className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-white">{l.lot_number}</span>
                  <span className="font-mono text-xs text-white/60">
                    {fmtNum(l.quantity_used)} {l.unit}
                  </span>
                </div>
                <p className="mt-1 text-xs text-white/70">{l.ingredient_name}</p>
                {l.supplier && (
                  <p className="mt-1 text-[11px] text-white/40">
                    via {l.supplier}
                    {l.po_number && (
                      <span className="ml-1 font-mono text-white/30">
                        ({l.po_number})
                      </span>
                    )}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Stage>

      <FlowArrow direction="down" label="Produced" />

      <Stage
        icon={<Package size={14} />}
        title={`${result.produced_finished_lots.length} finished-goods lot${result.produced_finished_lots.length === 1 ? '' : 's'} produced`}
        accent="sky"
      >
        {result.produced_finished_lots.length === 0 ? (
          <p className="text-xs text-white/40">
            No finished-goods lots recorded for this run yet. They&apos;re
            created when the run is completed via the multi-SKU dialog.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {result.produced_finished_lots.map((fl) => (
              <FinishedLotCard key={fl.id} lot={fl} />
            ))}
          </div>
        )}
      </Stage>

      <FlowArrow direction="down" label="Shipped to" />

      <Stage
        icon={<ShoppingBag size={14} />}
        title={`Sold in ${new Set(result.shipped_in.map((s) => s.id)).size} customer order${result.shipped_in.length === 1 ? '' : 's'}`}
        accent="emerald"
      >
        {result.shipped_in.length === 0 ? (
          <p className="text-xs text-white/40">
            Not yet referenced by any sales order.
          </p>
        ) : (
          <div className="space-y-2">
            {result.shipped_in.map((s) => (
              <SOCard key={`${s.id}-${s.matched_via}`} so={s} />
            ))}
          </div>
        )}
      </Stage>
    </div>
  )
}

// ─── Reverse view: SO → runs → lots → suppliers ──────────────────────────────

function ReverseView({ result }: { result: ReverseTraceResult }) {
  if (!result.so) {
    return <NotFound label={`No sales order found with "${result.query}"`} />
  }
  return (
    <div className="space-y-4">
      <Stage
        icon={<ShoppingBag size={14} />}
        title="Customer Order"
        accent="emerald"
      >
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm">
          <div className="flex items-center justify-between">
            <Link
              href={`/dashboard/sales-orders/${result.so.id}`}
              className="font-mono text-teal-300 hover:text-teal-200"
            >
              {result.so.order_number}
            </Link>
            <StatusPill status={result.so.status} />
          </div>
          <p className="mt-1 text-white/80">{result.so.customer_name}</p>
          {result.so.customer_email && (
            <p className="mt-0.5 text-xs text-white/40">
              {result.so.customer_email}
            </p>
          )}
          <p className="mt-1 text-[11px] text-white/40">
            Shipped {fmtDate(result.so.shipped_at)}
          </p>
        </div>
      </Stage>

      <FlowArrow direction="up" label="Fulfilled by" />

      <Stage
        icon={<Factory size={14} />}
        title={`${result.lines.length} order line${result.lines.length === 1 ? '' : 's'}`}
        accent="blue"
      >
        {result.lines.length === 0 ? (
          <p className="text-xs text-white/40">No lines.</p>
        ) : (
          <div className="space-y-3">
            {result.lines.map((line) => (
              <div
                key={line.line_id}
                className="rounded-lg border border-white/10 bg-white/[0.02] p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">
                    {line.recipe_name}
                  </span>
                  <span className="font-mono text-xs text-white/60">
                    {fmtNum(line.qty)} {line.unit}
                  </span>
                </div>
                {line.refs.length === 0 ? (
                  <p className="mt-2 text-xs text-white/40">
                    No lot allocations recorded.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2 border-l-2 border-blue-500/30 pl-3">
                    {line.refs.map((ref, i) => (
                      <RefBlock key={`${ref.raw}-${i}`} reference={ref} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Stage>

      {result.all_suppliers.length > 0 && (
        <>
          <FlowArrow direction="up" label="Original suppliers" />
          <Stage
            icon={<Info size={14} />}
            title={`Suppliers traced (${result.all_suppliers.length})`}
            accent="purple"
          >
            <div className="flex flex-wrap gap-1.5">
              {result.all_suppliers.map((s) => (
                <span
                  key={s}
                  className="inline-flex rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-white/80"
                >
                  {s}
                </span>
              ))}
            </div>
          </Stage>
        </>
      )}
    </div>
  )
}

function RefBlock({
  reference,
}: {
  reference: ReverseTraceResult['lines'][number]['refs'][number]
}) {
  const { raw, resolved_run, resolved_lot, consumed_lots } = reference

  if (resolved_run) {
    return (
      <div className="text-xs">
        <div className="flex items-center gap-1.5">
          <ChevronRight size={11} className="text-white/30" />
          <Link
            href={`/dashboard/production-runs/${resolved_run.id}`}
            className="font-mono text-teal-300 hover:text-teal-200"
          >
            {resolved_run.run_number}
          </Link>
          <span className="text-white/40">·</span>
          <span className="text-white/60">{resolved_run.recipe_name}</span>
          <StatusPill status={resolved_run.status} />
        </div>
        {consumed_lots.length > 0 && (
          <div className="mt-1.5 ml-4 space-y-0.5 border-l border-white/10 pl-3 text-[11px]">
            {consumed_lots.map((l) => (
              <div key={l.id} className="flex items-center gap-1.5">
                <ArrowRight size={9} className="text-white/30" />
                <span className="font-mono text-white/80">{l.lot_number}</span>
                <span className="text-white/40">·</span>
                <span className="text-white/60">{l.ingredient_name}</span>
                {l.supplier && (
                  <>
                    <span className="text-white/30">·</span>
                    <span className="text-white/50">{l.supplier}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
  if (resolved_lot) {
    // Finished-goods lot: show SKU name + upstream run + raw lots consumed.
    if (resolved_lot.kind === 'finished') {
      return (
        <div className="text-xs">
          <div className="flex items-center gap-1.5">
            <ChevronRight size={11} className="text-white/30" />
            <span className="font-mono text-white">
              {resolved_lot.lot_number}
            </span>
            <span className="text-white/40">·</span>
            {resolved_lot.sku_id ? (
              <Link
                href={`/dashboard/skus/${resolved_lot.sku_id}`}
                className="text-sky-300 hover:text-sky-200"
              >
                {resolved_lot.sku_name ?? 'SKU'}
              </Link>
            ) : (
              <span className="text-sky-300">
                {resolved_lot.sku_name ?? 'SKU'}
              </span>
            )}
            <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-medium text-sky-200">
              Finished goods
            </span>
          </div>
          {resolved_lot.production_run_number && resolved_lot.production_run_id && (
            <div className="mt-1 ml-4 text-[11px] text-white/50">
              produced by{' '}
              <Link
                href={`/dashboard/production-runs/${resolved_lot.production_run_id}`}
                className="font-mono text-teal-300 hover:text-teal-200"
              >
                {resolved_lot.production_run_number}
              </Link>
            </div>
          )}
          {consumed_lots.length > 0 && (
            <div className="mt-1.5 ml-4 space-y-0.5 border-l border-white/10 pl-3 text-[11px]">
              {consumed_lots.map((l) => (
                <div key={l.id} className="flex items-center gap-1.5">
                  <ArrowRight size={9} className="text-white/30" />
                  <span className="font-mono text-white/80">{l.lot_number}</span>
                  <span className="text-white/40">·</span>
                  <span className="text-white/60">{l.ingredient_name}</span>
                  {l.supplier && (
                    <>
                      <span className="text-white/30">·</span>
                      <span className="text-white/50">{l.supplier}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }
    // Raw ingredient lot (legacy bridge — some SOs still have raw lot#
    // in lot_numbers_allocated).
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <ChevronRight size={11} className="text-white/30" />
        <span className="font-mono text-white">{resolved_lot.lot_number}</span>
        <span className="text-white/40">·</span>
        <span className="text-white/60">{resolved_lot.ingredient_name}</span>
        {resolved_lot.supplier && (
          <>
            <span className="text-white/30">·</span>
            <span className="text-white/50">{resolved_lot.supplier}</span>
          </>
        )}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <ChevronRight size={11} className="text-white/30" />
      <span className="font-mono text-white/80">{raw}</span>
      <span className="text-[10px] text-white/40">
        (unresolved — not a known run or lot)
      </span>
    </div>
  )
}

// ─── Shared atoms ────────────────────────────────────────────────────────────

function LotCard({ lot }: { lot: ForwardTraceResult['lot'] }) {
  if (!lot) return null

  // Color + body differ by lot kind. Raw = green/teal, finished = blue.
  const isFinished = lot.kind === 'finished'
  const cardCls = isFinished
    ? 'rounded-lg border border-sky-500/30 bg-sky-500/[0.06] p-3'
    : 'rounded-lg border border-emerald-500/30 bg-emerald-500/[0.05] p-3'
  const pillCls = isFinished
    ? 'bg-sky-500/20 text-sky-200'
    : 'bg-emerald-500/20 text-emerald-200'

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-white">{lot.lot_number}</span>
        <span className="flex items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${pillCls}`}>
            {isFinished ? 'Finished goods' : 'Raw'}
          </span>
          <span className="text-xs text-white/40">{lot.unit}</span>
        </span>
      </div>

      {isFinished ? (
        <>
          <p className="mt-1 text-sm text-white/80">
            {lot.sku_id ? (
              <Link
                href={`/dashboard/skus/${lot.sku_id}`}
                className="hover:text-sky-300"
              >
                {lot.sku_name ?? 'SKU'}
              </Link>
            ) : (
              <span>{lot.sku_name ?? 'SKU'}</span>
            )}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-white/50">
            {lot.production_run_number && lot.production_run_id && (
              <div>
                Run:{' '}
                <Link
                  href={`/dashboard/production-runs/${lot.production_run_id}`}
                  className="font-mono text-sky-300 hover:text-sky-200"
                >
                  {lot.production_run_number}
                </Link>
              </div>
            )}
            <div>Produced: {fmtDate(lot.received_date)}</div>
            <div>Expiry: {fmtDate(lot.expiry_date)}</div>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-white/80">
            {lot.ingredient_id ? (
              <Link
                href={`/dashboard/ingredients/${lot.ingredient_id}`}
                className="hover:text-emerald-300"
              >
                {lot.ingredient_name}
              </Link>
            ) : (
              <span>{lot.ingredient_name}</span>
            )}
            {lot.ingredient_sku && (
              <span className="ml-1.5 text-xs text-white/40">
                ({lot.ingredient_sku})
              </span>
            )}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-white/50">
            {lot.supplier && (
              <div>
                Supplier: <span className="text-white/80">{lot.supplier}</span>
              </div>
            )}
            {lot.po_number && (
              <div>
                PO:{' '}
                <span className="font-mono text-white/80">{lot.po_number}</span>
              </div>
            )}
            <div>Received: {fmtDate(lot.received_date)}</div>
            <div>Expiry: {fmtDate(lot.expiry_date)}</div>
          </div>
        </>
      )}
    </div>
  )
}

function SOCard({ so }: { so: ForwardTraceResult['shipped_in'][number] }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm">
      <div className="flex items-center justify-between">
        <Link
          href={`/dashboard/sales-orders/${so.id}`}
          className="font-mono text-teal-300 hover:text-teal-200"
        >
          {so.order_number}
        </Link>
        <StatusPill status={so.status} />
      </div>
      <p className="mt-1 text-white/80">{so.customer_name}</p>
      <div className="mt-1 flex items-center justify-between text-[11px] text-white/40">
        <span>
          {so.recipe_name} — <span className="font-mono">{fmtNum(so.qty)} {so.unit}</span>
        </span>
        <span>shipped {fmtDate(so.shipped_at)}</span>
      </div>
      {so.matched_via && (
        <p className="mt-1 text-[10px] text-white/30">
          matched via{' '}
          <span className="font-mono text-white/50">{so.matched_via}</span>
        </p>
      )}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${
        STATUS_BADGE[status] ?? 'bg-white/10 text-white/60'
      }`}
    >
      {status.replace('_', ' ')}
    </span>
  )
}

const ACCENT_BORDER: Record<string, string> = {
  teal: 'border-teal-500/30 bg-teal-500/[0.04]',
  blue: 'border-blue-500/30 bg-blue-500/[0.04]',
  emerald: 'border-emerald-500/30 bg-emerald-500/[0.04]',
  purple: 'border-purple-500/30 bg-purple-500/[0.04]',
  sky: 'border-sky-500/30 bg-sky-500/[0.04]',
}
const ACCENT_LABEL: Record<string, string> = {
  teal: 'text-teal-300',
  blue: 'text-blue-300',
  emerald: 'text-emerald-300',
  purple: 'text-purple-300',
  sky: 'text-sky-300',
}

function Stage({
  icon,
  title,
  intro,
  accent,
  children,
}: {
  icon: React.ReactNode
  title: string
  intro?: string
  accent: 'teal' | 'blue' | 'emerald' | 'purple' | 'sky'
  children: React.ReactNode
}) {
  return (
    <section className={`rounded-2xl border ${ACCENT_BORDER[accent]} p-4`}>
      <div className="mb-3 flex items-center gap-2">
        <span className={ACCENT_LABEL[accent]}>{icon}</span>
        <h2 className={`text-sm font-semibold uppercase tracking-wider ${ACCENT_LABEL[accent]}`}>
          {title}
        </h2>
      </div>
      {intro && <p className="mb-3 text-xs text-white/50">{intro}</p>}
      {children}
    </section>
  )
}

function FlowArrow({
  direction = 'down',
  label,
}: {
  direction?: 'down' | 'up'
  label?: string
}) {
  return (
    <div className="flex items-center justify-center gap-2 text-xs text-white/30">
      <span>{direction === 'up' ? '↑' : '↓'}</span>
      {label && <span>{label}</span>}
    </div>
  )
}

function NotFound({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-12 text-center text-sm text-white/40">
      {label}
    </div>
  )
}
