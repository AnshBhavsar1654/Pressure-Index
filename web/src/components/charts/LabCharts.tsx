'use client'

import { scaleLinear } from 'd3-scale'
import { curveMonotoneX, line } from 'd3-shape'
import { useState } from 'react'
import { signed } from '@/components/kit'
import type { CalBin, Role } from '@/lib/types'
import { AXIS, Tooltip, TipRow, useWidth, type TipState } from './core'

/* One colour job each: the production model wears signal, its closest rival data teal, the rest neutral. */
export const MODEL_COLOR: Record<string, string> = { logistic: 'var(--signal)', gbm: 'var(--data)', gbm_isotonic: 'var(--ink-3)' }
export const MODEL_LABEL: Record<string, string> = { logistic: 'Logistic (production)', gbm: 'Gradient boosting', gbm_isotonic: 'Boosting + isotonic' }

const tipAt = (e: React.PointerEvent<SVGElement>) => {
  const r = ((e.currentTarget as SVGElement).ownerSVGElement as SVGSVGElement).getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

/** Reliability diagram for several models on shared axes. */
export function CalibrationMulti({ series, height = 300 }: { series: Record<string, CalBin[]>; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState | null>(null)
  const m = { t: 10, r: 12, b: 38, l: 44 }
  const x = scaleLinear().domain([0, 1]).range([m.l, width - m.r])
  const y = scaleLinear().domain([0, 1]).range([height - m.b, m.t])
  const keys = Object.keys(series)
  return (
    <div ref={ref} className="relative w-full min-w-0">
      <svg width={width} height={height} role="img" aria-label="Calibration: predicted against actual win rate for each model">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={AXIS.grid} />
            <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" {...AXIS.tick} className="num">
              {t * 100}%
            </text>
            <text x={x(t)} y={height - m.b + 16} textAnchor="middle" {...AXIS.tick} className="num">
              {t * 100}%
            </text>
          </g>
        ))}
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--ink-3)" strokeDasharray="4 4" />
        <text x={x(0.5)} y={height - 4} textAnchor="middle" {...AXIS.label}>
          Predicted win probability (out-of-fold)
        </text>
        {keys.map((k) => {
          const pts = series[k]
          const d = line<CalBin>().x((b) => x(b.pred)).y((b) => y(b.actual))(pts) ?? ''
          return (
            <g key={k}>
              <path d={d} fill="none" stroke={MODEL_COLOR[k]} strokeWidth={2} strokeDasharray={k === 'gbm_isotonic' ? '5 4' : undefined} />
              {pts.map((b) => (
                <circle
                  key={b.pred}
                  cx={x(b.pred)}
                  cy={y(b.actual)}
                  r={4.5}
                  fill={MODEL_COLOR[k]}
                  stroke="var(--panel)"
                  strokeWidth={2}
                  onPointerEnter={(e) =>
                    setTip({
                      ...tipAt(e),
                      content: (
                        <div className="flex flex-col gap-0.5">
                          <div className="font-semibold">{MODEL_LABEL[k]}</div>
                          <TipRow label="Predicted" value={`${(b.pred * 100).toFixed(1)}%`} />
                          <TipRow label="Actual" value={`${(b.actual * 100).toFixed(1)}%`} />
                          <TipRow label="Balls in bin" value={b.n.toLocaleString('en-IN')} />
                        </div>
                      ),
                    })
                  }
                  onPointerLeave={() => setTip(null)}
                />
              ))}
            </g>
          )
        })}
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  )
}

/** Horizontal bars, one hue, labelled values. */
export function HBars({
  rows,
  digits = 3,
  color = 'var(--data)',
  unit,
}: {
  rows: { label: string; value: number; highlight?: boolean }[]
  digits?: number
  color?: string
  unit?: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const rowH = 30
  const m = { l: Math.min(190, width * 0.42), r: 64 }
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1e-9)
  const min = Math.min(0, ...rows.map((r) => r.value))
  const x = scaleLinear().domain([min, max]).range([m.l, width - m.r])
  const height = rows.length * rowH + 6
  return (
    <div ref={ref} className="w-full min-w-0">
      <svg width={width} height={height} role="img" aria-label={unit ?? 'bar chart'}>
        {min < 0 && <line x1={x(0)} x2={x(0)} y1={0} y2={height} stroke={AXIS.rule} />}
        {rows.map((r, i) => {
          const cy = i * rowH + rowH / 2
          const x0 = x(Math.min(0, r.value))
          return (
            <g key={r.label}>
              <text x={m.l - 10} y={cy} dy="0.32em" textAnchor="end" fontSize={12.5} fill={r.highlight ? 'var(--ink)' : 'var(--ink-2)'} fontWeight={r.highlight ? 600 : 400}>
                {r.label}
              </text>
              <rect x={x0} y={cy - 8} width={Math.max(2, Math.abs(x(r.value) - x(0)))} height={16} rx={4} fill={r.highlight ? 'var(--signal)' : color} />
              <text x={Math.max(x(r.value), x(0)) + 6} y={cy} dy="0.32em" fontSize={12} fill="var(--ink)" className="num">
                {r.value.toFixed(digits)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** Forward-test correlation over the hyperparameter grid: pressure line (rows) x K (columns), for one recency step. */
export function TuningHeatmap({
  rows,
  grid,
  production,
  best,
}: {
  rows: { role: Role; pctl: number; K: number; step: number; r: number }[]
  grid: { pctl: number[]; K: number[]; step: number[] }
  production: { pctl: number; K: number; step: number }
  best: { pctl: number; K: number; step: number }
}) {
  const [role, setRole] = useState<'mean' | Role>('mean')
  const [step, setStep] = useState(production.step)
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState | null>(null)
  const cell = (pctl: number, K: number) => {
    const xs = rows.filter((r) => r.pctl === pctl && r.K === K && r.step === step && (role === 'mean' || r.role === role))
    return xs.reduce((a, b) => a + b.r, 0) / (xs.length || 1)
  }
  const all = grid.pctl.flatMap((p) => grid.K.map((k) => cell(p, k)))
  const lo = Math.min(...all)
  const hi = Math.max(...all)
  const m = { t: 8, r: 8, b: 40, l: 70 }
  const cw = (width - m.l - m.r) / grid.K.length
  const ch = 44
  const height = m.t + ch * grid.pctl.length + m.b
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <label className="flex items-center gap-2 text-ink-2">
          Role
          <select value={role} onChange={(e) => setRole(e.target.value as 'mean' | Role)} className="h-9 rounded-md border border-line bg-panel-2 px-2 text-foreground">
            <option value="mean">Both (mean)</option>
            <option value="bat">Batters</option>
            <option value="bowl">Bowlers</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-ink-2">
          Recency step
          <select value={step} onChange={(e) => setStep(Number(e.target.value))} className="h-9 rounded-md border border-line bg-panel-2 px-2 text-foreground">
            {grid.step.map((s) => (
              <option key={s} value={s}>
                {s === 0 ? 'none (all seasons equal)' : `${Math.round(s * 100)}% less per season`}
              </option>
            ))}
          </select>
        </label>
        <span className="ml-auto flex items-center gap-2 text-[12px] text-ink-3">
          <span className="num">{lo.toFixed(2)}</span>
          <span className="h-2.5 w-24 rounded-full" style={{ background: 'linear-gradient(90deg, var(--panel-2), var(--signal))' }} />
          <span className="num">{hi.toFixed(2)}</span>
        </span>
      </div>
      <div ref={ref} className="relative w-full min-w-0">
        <svg width={width} height={height} role="img" aria-label="Forward-test correlation by pressure line and K">
          {grid.pctl.map((p, i) =>
            grid.K.map((k, j) => {
              const v = cell(p, k)
              const t = hi > lo ? (v - lo) / (hi - lo) : 0.5
              const isProd = p === production.pctl && k === production.K && step === production.step
              const isBest = p === best.pctl && k === best.K && step === best.step
              return (
                <g
                  key={`${p}-${k}`}
                  onPointerEnter={(e) =>
                    setTip({
                      ...tipAt(e),
                      content: (
                        <div className="flex flex-col gap-0.5">
                          <TipRow label="Pressure line" value={`top ${Math.round((1 - p) * 100)}%`} />
                          <TipRow label="K" value={k} />
                          <TipRow label="Forward r" value={v.toFixed(3)} />
                          {isProd && <div className="font-semibold text-signal-ink">Production setting</div>}
                          {isBest && <div className="font-semibold">Best in the sweep</div>}
                        </div>
                      ),
                    })
                  }
                  onPointerLeave={() => setTip(null)}
                >
                  <rect x={m.l + j * cw + 1} y={m.t + i * ch + 1} width={cw - 2} height={ch - 2} rx={4} fill="var(--signal)" fillOpacity={0.08 + 0.85 * t} stroke={isProd ? 'var(--ink)' : 'none'} strokeWidth={2} />
                  <text x={m.l + j * cw + cw / 2} y={m.t + i * ch + ch / 2} dy="0.32em" textAnchor="middle" fontSize={12} fill={t > 0.6 ? '#0b0f14' : 'var(--ink)'} className="num">
                    {v.toFixed(3)}
                    {isBest ? ' ★' : ''}
                  </text>
                </g>
              )
            }),
          )}
          {grid.pctl.map((p, i) => (
            <text key={p} x={m.l - 10} y={m.t + i * ch + ch / 2} dy="0.32em" textAnchor="end" {...AXIS.tick}>
              top {Math.round((1 - p) * 100)}%
            </text>
          ))}
          {grid.K.map((k, j) => (
            <text key={k} x={m.l + j * cw + cw / 2} y={height - m.b + 16} textAnchor="middle" {...AXIS.tick} className="num">
              {k}
            </text>
          ))}
          <text x={m.l + (width - m.l - m.r) / 2} y={height - 4} textAnchor="middle" {...AXIS.label}>
            K: weighted pressure balls before a record counts half (more K = more shrinkage)
          </text>
        </svg>
        <Tooltip tip={tip} width={width} />
      </div>
    </div>
  )
}

/** Chase win probability curves from the production model: one hue, darker = more wickets in hand. */
export function WpCurves({ curves, xLabel, keyPrefix = '', keySuffix = '' }: { curves: { k: number; points: [number, number][] }[]; xLabel: string; keyPrefix?: string; keySuffix?: string }) {
  const keyLabel = (k: number) => `${keyPrefix}${k}${keySuffix}`
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hx, setHx] = useState<number | null>(null)
  const height = 280
  const m = { t: 12, r: 70, b: 40, l: 44 }
  const xs = curves.flatMap((c) => c.points.map((p) => p[0]))
  const x = scaleLinear().domain([Math.min(...xs), Math.max(...xs)]).range([m.l, width - m.r])
  const y = scaleLinear().domain([0, 1]).range([height - m.b, m.t])
  const n = curves.length
  const op = (i: number) => 0.35 + (0.65 * i) / Math.max(1, n - 1)
  const near = (pts: [number, number][]) => (hx == null ? null : pts.reduce((a, b) => (Math.abs(b[0] - hx) < Math.abs(a[0] - hx) ? b : a)))
  return (
    <div ref={ref} className="relative w-full min-w-0">
      <svg width={width} height={height} role="img" aria-label="Chase win probability curves">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={AXIS.grid} />
            <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" {...AXIS.tick} className="num">
              {t * 100}%
            </text>
          </g>
        ))}
        {x.ticks(6).map((t) => (
          <text key={t} x={x(t)} y={height - m.b + 16} textAnchor="middle" {...AXIS.tick} className="num">
            {t}
          </text>
        ))}
        <text x={m.l + (width - m.l - m.r) / 2} y={height - 4} textAnchor="middle" {...AXIS.label}>
          {xLabel}
        </text>
        {curves.map((c, i) => {
          const d = line<[number, number]>().x((p) => x(p[0])).y((p) => y(p[1])).curve(curveMonotoneX)(c.points) ?? ''
          const last = c.points.at(-1)!
          const h = near(c.points)
          return (
            <g key={c.k}>
              <path d={d} fill="none" stroke="var(--signal)" strokeOpacity={op(i)} strokeWidth={2} />
              <text x={x(last[0]) + 6} y={y(last[1])} dy="0.32em" fontSize={11.5} fill="var(--ink-2)">
                {keyLabel(c.k)}
              </text>
              {h && <circle cx={x(h[0])} cy={y(h[1])} r={4} fill="var(--signal)" fillOpacity={op(i)} stroke="var(--panel)" strokeWidth={1.5} />}
              {h && (
                <text x={x(h[0]) - 6} y={y(h[1]) - 8} textAnchor="end" fontSize={11} fill="var(--ink)" className="num">
                  {Math.round(h[1] * 100)}%
                </text>
              )}
            </g>
          )
        })}
        {hx != null && <line x1={x(hx)} x2={x(hx)} y1={m.t} y2={height - m.b} stroke={AXIS.rule} />}
        <rect
          x={m.l}
          y={m.t}
          width={Math.max(0, width - m.l - m.r)}
          height={height - m.t - m.b}
          fill="transparent"
          onPointerMove={(e) => setHx(x.invert(tipAt(e).x))}
          onPointerLeave={() => setHx(null)}
        />
      </svg>
    </div>
  )
}

/** Expected runs still to come, by balls left (across) and wickets lost (down): one hue, darker = more runs. */
export function ReSurface({ rows }: { rows: [number, number, number][] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState | null>(null)
  const balls = [...new Set(rows.map((r) => r[0]))].sort((a, b) => b - a)
  const wk = [...new Set(rows.map((r) => r[1]))].sort((a, b) => a - b)
  const max = Math.max(...rows.map((r) => r[2]))
  const m = { t: 6, r: 6, b: 38, l: 64 }
  const cw = (width - m.l - m.r) / balls.length
  const ch = 24
  const height = m.t + wk.length * ch + m.b
  const val = new Map(rows.map((r) => [`${r[0]}-${r[1]}`, r[2]]))
  return (
    <div ref={ref} className="relative w-full min-w-0">
      <svg width={width} height={height} role="img" aria-label="Expected runs to come by balls left and wickets lost">
        {wk.map((w, i) =>
          balls.map((b, j) => {
            const v = val.get(`${b}-${w}`) ?? 0
            return (
              <rect
                key={`${b}-${w}`}
                x={m.l + j * cw + 0.5}
                y={m.t + i * ch + 0.5}
                width={cw - 1}
                height={ch - 1}
                rx={2}
                fill="var(--data)"
                fillOpacity={0.05 + 0.9 * (v / max)}
                onPointerEnter={(e) =>
                  setTip({
                    ...tipAt(e),
                    content: (
                      <div className="flex flex-col gap-0.5">
                        <TipRow label="Balls left" value={b} />
                        <TipRow label="Wickets lost" value={w} />
                        <TipRow label="Runs to come" value={v.toFixed(1)} />
                      </div>
                    ),
                  })
                }
                onPointerLeave={() => setTip(null)}
              />
            )
          }),
        )}
        {wk.map((w, i) => (
          <text key={w} x={m.l - 8} y={m.t + i * ch + ch / 2} dy="0.32em" textAnchor="end" {...AXIS.tick}>
            {w} down
          </text>
        ))}
        {balls.map((b, j) =>
          j % 2 === 0 ? (
            <text key={b} x={m.l + j * cw + cw / 2} y={height - m.b + 14} textAnchor="middle" {...AXIS.tick} className="num">
              {b}
            </text>
          ) : null,
        )}
        <text x={m.l + (width - m.l - m.r) / 2} y={height - 4} textAnchor="middle" {...AXIS.label}>
          Balls left in the innings
        </text>
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  )
}

/** Rating with its 90% bootstrap interval, top 10. */
export function IntervalChart({ rows }: { rows: { name: string; rank: number; rating: number; rating_lo: number; rating_hi: number; p_top10: number }[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const rowH = 30
  const m = { t: 6, r: 56, b: 30, l: Math.min(170, width * 0.38) }
  const lo = Math.min(0, ...rows.map((r) => r.rating_lo))
  const hi = Math.max(...rows.map((r) => r.rating_hi))
  const x = scaleLinear().domain([lo, hi]).nice().range([m.l, width - m.r])
  const height = m.t + rows.length * rowH + m.b
  return (
    <div ref={ref} className="w-full min-w-0">
      <svg width={width} height={height} role="img" aria-label="Pressure rating with 90% bootstrap interval">
        {x.ticks(5).map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={m.t} y2={height - m.b} stroke={t === 0 ? AXIS.rule : AXIS.grid} />
            <text x={x(t)} y={height - m.b + 16} textAnchor="middle" {...AXIS.tick} className="num">
              {signed(t, 0)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cy = m.t + i * rowH + rowH / 2
          return (
            <g key={r.name}>
              <text x={m.l - 10} y={cy} dy="0.32em" textAnchor="end" fontSize={12.5} fill="var(--ink)">
                <tspan fill="var(--ink-3)" className="num">{r.rank}. </tspan>
                {r.name}
              </text>
              <line x1={x(r.rating_lo)} x2={x(r.rating_hi)} y1={cy} y2={cy} stroke="var(--data)" strokeWidth={3} strokeLinecap="round" strokeOpacity={0.55} />
              <circle cx={x(r.rating)} cy={cy} r={5} fill="var(--signal)" stroke="var(--panel)" strokeWidth={2} />
              <text x={width - m.r + 8} y={cy} dy="0.32em" fontSize={11.5} fill="var(--ink-2)" className="num">
                {Math.round(r.p_top10 * 100)}%
              </text>
            </g>
          )
        })}
        <text x={width - m.r + 8} y={height - 6} fontSize={10.5} fill="var(--ink-3)">
          top-10
        </text>
      </svg>
    </div>
  )
}
