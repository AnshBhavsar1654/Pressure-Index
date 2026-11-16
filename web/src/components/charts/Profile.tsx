'use client'

import { scaleBand, scaleLinear } from 'd3-scale'
import { useState } from 'react'
import type { PlayerMatch, ScoredPlayer } from '@/lib/types'
import { fmt } from '@/lib/format'
import { AXIS, Tooltip, TipRow, useWidth, type TipState } from './core'

/**
 * One bar per match with pressure exposure: run value above (pink) or below (blue)
 * expectation. The rhythm of pink vs blue is the consistency story.
 */
export function MatchStrip({ matches, role }: { matches: PlayerMatch[]; role: 'bat' | 'bowl' }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState | null>(null)
  const height = 200
  const m = { t: 10, r: 8, b: 28, l: 40 }
  const x = scaleBand<number>()
    .domain(matches.map((_, i) => i))
    .range([m.l, width - m.r])
    .paddingInner(matches.length > 60 ? 0.15 : 0.25)
  const ext = Math.max(4, ...matches.map((d) => Math.abs(d.rv)))
  const y = scaleLinear().domain([-ext, ext]).nice().range([height - m.b, m.t])
  const years = matches.reduce<{ i: number; yr: string }[]>((acc, d, i) => {
    const yr = d.date.slice(0, 4)
    if (!acc.length || acc[acc.length - 1].yr !== yr) acc.push({ i, yr })
    return acc
  }, [])
  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-x-clip">
      <svg width={width} height={height} role="img" aria-label="Run value in each match with pressure exposure">
        {y.ticks(4).map((t) => (
          <g key={t}>
            <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS.rule : AXIS.grid} />
            <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" {...AXIS.tick} className="num">
              {fmt.signed(t, 0)}
            </text>
          </g>
        ))}
        {years.map(({ i, yr }) => (
          <g key={yr}>
            <line x1={x(i)} x2={x(i)} y1={m.t} y2={height - m.b + 4} stroke={AXIS.rule} />
            <text x={(x(i) ?? 0) + 3} y={height - m.b + 16} {...AXIS.tick} className="num">
              {yr}
            </text>
          </g>
        ))}
        {matches.map((d, i) => {
          const pos = d.rv >= 0
          const top = y(Math.max(0, d.rv))
          const h = Math.max(1, Math.abs(y(d.rv) - y(0)))
          return (
            <rect
              key={d.id}
              x={x(i)}
              y={top}
              width={x.bandwidth()}
              height={h}
              rx={Math.min(2, x.bandwidth() / 2)}
              fill={pos ? 'var(--pink)' : 'var(--blue)'}
              onPointerEnter={(e) => {
                const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
                setTip({
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                  content: (
                    <div className="flex flex-col gap-1">
                      <div className="font-semibold">{role === 'bat' ? `v ${d.opp}` : `v ${d.opp}`}</div>
                      <div className="text-ink-3">
                        {d.comp} · {fmt.date(d.date)}
                      </div>
                      <TipRow label="Pressure balls" value={d.balls} />
                      <TipRow label={role === 'bat' ? 'Runs / out' : 'Runs / wkts'} value={`${d.r} / ${d.out}`} />
                      <TipRow label="Run value" value={fmt.signed(d.rv, 1)} />
                      <TipRow label="Win prob. added" value={fmt.signed(d.wpa * 100, 1) + ' pts'} />
                    </div>
                  ),
                })
              }}
              onPointerLeave={() => setTip(null)}
            />
          )
        })}
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  )
}

/** Bootstrap rank intervals: median dot + 90% range, ordered by live rank. */
export function RankRanges({ players, n = 15 }: { players: ScoredPlayer[]; n?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState | null>(null)
  const rows = players.slice(0, n)
  const rowH = 24
  const m = { t: 22, r: 16, b: 18, l: 150 }
  const height = m.t + rows.length * rowH + m.b
  const maxR = Math.max(30, ...rows.map((p) => p.boot.rank_hi))
  const x = scaleLinear().domain([1, maxR]).range([m.l, width - m.r])
  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-x-clip">
      <svg width={width} height={height} role="img" aria-label="Bootstrap rank intervals">
        <rect x={x(1)} y={m.t - 6} width={x(10.5) - x(1)} height={rows.length * rowH + 4} fill="var(--pink-soft)" opacity={0.5} />
        <text x={x(10.5) - 4} y={height - 2} textAnchor="end" {...AXIS.label} fill="var(--pink)" fontWeight={600}>
          top-10 zone
        </text>
        {[1, 10, 20, 30, 40, 50].filter((t) => t <= maxR).map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={m.t - 4} y2={height - m.b} stroke={AXIS.grid} />
            <text x={x(t)} y={m.t - 10} textAnchor="middle" {...AXIS.tick} className="num">
              {t === 1 ? 'rank 1' : t}
            </text>
          </g>
        ))}
        {rows.map((p, i) => {
          const cy = m.t + i * rowH + rowH / 2
          return (
            <g
              key={p.id}
              onPointerEnter={(e) => {
                const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
                setTip({
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                  content: (
                    <div className="flex flex-col gap-1">
                      <div className="font-semibold">{p.name}</div>
                      <TipRow label="Median bootstrap rank" value={p.boot.rank_med} />
                      <TipRow label="90% interval" value={`${p.boot.rank_lo} to ${p.boot.rank_hi}`} />
                      <TipRow label="P(top 10)" value={fmt.pct(p.boot.p_top10)} />
                    </div>
                  ),
                })
              }}
              onPointerLeave={() => setTip(null)}
            >
              <rect x={0} y={cy - rowH / 2} width={width} height={rowH} fill="transparent" />
              <text x={m.l - 10} y={cy} dy="0.32em" textAnchor="end" fontSize={12} fill="var(--ink)">
                <tspan fill="var(--ink-3)" className="num">
                  {p.liveRank}.{' '}
                </tspan>
                {p.name.length > 17 ? p.name.split(' ').slice(-1)[0] : p.name}
              </text>
              <line x1={x(p.boot.rank_lo)} x2={x(p.boot.rank_hi)} y1={cy} y2={cy} stroke="var(--blue)" strokeWidth={2} strokeLinecap="round" />
              <circle cx={x(p.boot.rank_med)} cy={cy} r={5} fill="var(--pink)" stroke="var(--surface)" strokeWidth={2} />
            </g>
          )
        })}
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  )
}

/** Component z-scores as horizontal diverging bars. */
export function ComponentBars({ z, labels }: { z: Record<string, number>; labels: Record<string, string> }) {
  const keys = Object.keys(labels)
  const ext = Math.max(2, ...keys.map((k) => Math.abs(z[k])))
  return (
    <div className="flex flex-col gap-2.5">
      {keys.map((k) => {
        const v = z[k]
        const pct = (Math.abs(v) / ext) * 50
        return (
          <div key={k} className="grid grid-cols-[minmax(0,10rem)_1fr_3.2rem] items-center gap-3 text-[13px]">
            <span className="truncate text-ink-2">{labels[k]}</span>
            <div className="relative h-3 rounded-[2px] bg-surface-2">
              <div className="absolute left-1/2 top-[-3px] h-[18px] w-px bg-line-strong" />
              <div
                className="absolute top-0 h-3 rounded-[2px]"
                style={{
                  background: v >= 0 ? 'var(--pink)' : 'var(--blue)',
                  left: v >= 0 ? '50%' : `${50 - pct}%`,
                  width: `${pct}%`,
                }}
              />
            </div>
            <span className="num text-right font-medium">{fmt.signed(v, 2)}</span>
          </div>
        )
      })}
      <div className="grid grid-cols-[minmax(0,10rem)_1fr_3.2rem] gap-3 text-[11px] text-ink-3">
        <span />
        <div className="flex justify-between">
          <span>below eligible average</span>
          <span>above</span>
        </div>
        <span className="text-right">z</span>
      </div>
    </div>
  )
}

/** Reliability diagram for the win-probability model. */
export function Calibration({ bins }: { bins: { pred: number; actual: number; n: number }[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const size = Math.min(width, 300)
  const m = { t: 10, r: 10, b: 34, l: 40 }
  const s = scaleLinear().domain([0, 1]).range([0, size - m.l - m.r])
  const h = size - m.t - m.b
  const yS = scaleLinear().domain([0, 1]).range([m.t + h, m.t])
  return (
    <div ref={ref} className="w-full">
      <svg width={size} height={size} role="img" aria-label="Win probability calibration">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={m.l} x2={m.l + s(1)} y1={yS(t)} y2={yS(t)} stroke={AXIS.grid} />
            <text x={m.l - 6} y={yS(t)} dy="0.32em" textAnchor="end" {...AXIS.tick}>
              {t * 100}
            </text>
            <text x={m.l + s(t)} y={m.t + h + 14} textAnchor="middle" {...AXIS.tick}>
              {t * 100}
            </text>
          </g>
        ))}
        <line x1={m.l} y1={yS(0)} x2={m.l + s(1)} y2={yS(1)} stroke="var(--ink-3)" />
        {bins.map((b) => (
          <circle key={b.pred} cx={m.l + s(b.pred)} cy={yS(b.actual)} r={Math.max(3, Math.min(8, Math.sqrt(b.n) / 18))} fill="var(--pink)" stroke="var(--surface)" strokeWidth={1.5} />
        ))}
        <text x={m.l + s(0.5)} y={size - 4} textAnchor="middle" {...AXIS.label}>
          Predicted win % (out-of-fold)
        </text>
      </svg>
    </div>
  )
}
