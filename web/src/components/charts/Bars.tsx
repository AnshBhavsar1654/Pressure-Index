'use client'

import { scaleBand, scaleLinear } from 'd3-scale'
import { useState } from 'react'
import { fmt } from '@/lib/format'
import { AXIS, Tooltip, TipRow, useWidth, type TipState } from './core'

/** Histogram of Leverage Index with the pressure threshold marked. */
export function LiHistogram({
  bins,
  threshold,
}: {
  bins: { x: number; n: number; p: number }[]
  threshold: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState | null>(null)
  const height = 220
  const m = { t: 18, r: 12, b: 36, l: 48 }
  const shown = bins.filter((b) => b.x < 5)
  const step = shown[1].x - shown[0].x
  const x = scaleLinear().domain([0, 5]).range([m.l, width - m.r])
  const y = scaleLinear()
    .domain([0, Math.max(...shown.map((b) => b.n))])
    .nice()
    .range([height - m.b, m.t])
  const bw = Math.max(1, x(step) - x(0) - 2)
  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-x-clip">
      <svg width={width} height={height} role="img" aria-label="Distribution of Leverage Index across all deliveries">
        {y.ticks(4).map((t) => (
          <g key={t}>
            <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={AXIS.grid} />
            <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" {...AXIS.tick} className="num">
              {t >= 1000 ? `${t / 1000}k` : t}
            </text>
          </g>
        ))}
        {shown.map((b) => {
          const press = b.x + step / 2 >= threshold
          return (
            <rect
              key={b.x}
              x={x(b.x) + 1}
              y={y(b.n)}
              width={bw}
              height={Math.max(0, height - m.b - y(b.n))}
              rx={1.5}
              fill={press ? 'var(--pink)' : 'var(--blue)'}
              fillOpacity={press ? 0.95 : 0.55}
              onPointerEnter={(e) => {
                const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
                setTip({
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                  content: (
                    <div className="flex flex-col gap-1">
                      <div className="font-semibold">
                        Stakes {b.x.toFixed(1)}× to {(b.x + step).toFixed(1)}×
                      </div>
                      <TipRow label="Deliveries" value={fmt.int(b.n)} />
                      <TipRow label="Classed as" value={press ? 'Pressure ball' : 'Normal ball'} />
                    </div>
                  ),
                })
              }}
              onPointerLeave={() => setTip(null)}
            />
          )
        })}
        <line x1={x(threshold)} x2={x(threshold)} y1={m.t - 8} y2={height - m.b} stroke="var(--ink)" strokeWidth={1.5} />
        <text x={x(threshold) + 6} y={m.t - 2} {...AXIS.label} fill="var(--ink)" fontWeight={600}>
          pressure moments: the top 20%
        </text>
        {[0, 1, 2, 3, 4, 5].map((t) => (
          <text key={t} x={x(t)} y={height - m.b + 15} textAnchor="middle" {...AXIS.tick} className="num">
            {t === 5 ? '5+' : t}
          </text>
        ))}
        <text x={(m.l + width - m.r) / 2} y={height - 4} textAnchor="middle" {...AXIS.label}>
          Stakes of the ball (1.0 = a typical ball)
        </text>
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  )
}

/** Grouped bars: share of deliveries that are high-pressure, by phase and innings. */
export function PhaseBars({
  rows,
}: {
  rows: { innings: number; phase: string; pressure_share: number; balls: number; li: number }[]
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState | null>(null)
  const height = 220
  const m = { t: 16, r: 8, b: 30, l: 40 }
  const phases = ['Powerplay', 'Middle', 'Death']
  const x0 = scaleBand<string>().domain(phases).range([m.l, width - m.r]).paddingInner(0.3).paddingOuter(0.1)
  const x1 = scaleBand<number>().domain([1, 2]).range([0, x0.bandwidth()]).paddingInner(0.08)
  const yMax = Math.ceil(Math.max(40, ...rows.map((r) => r.pressure_share)) / 10) * 10
  const ticks = Array.from({ length: yMax / 10 + 1 }, (_, i) => i * 10)
  const y = scaleLinear().domain([0, yMax]).range([height - m.b, m.t])
  const color = (inn: number) => (inn === 1 ? 'var(--blue)' : 'var(--pink)')
  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-x-clip">
      <svg width={width} height={height} role="img" aria-label="Share of high-pressure deliveries by phase">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={AXIS.grid} />
            <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" {...AXIS.tick} className="num">
              {t}%
            </text>
          </g>
        ))}
        {rows.map((r) => {
          const bx = (x0(r.phase) ?? 0) + (x1(r.innings) ?? 0)
          return (
            <g key={`${r.innings}${r.phase}`}>
              <path
                d={roundedTop(bx, y(r.pressure_share), x1.bandwidth(), height - m.b - y(r.pressure_share), 4)}
                fill={color(r.innings)}
                onPointerEnter={(e) => {
                  const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
                  setTip({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                    content: (
                      <div className="flex flex-col gap-1">
                        <div className="font-semibold">
                          {r.phase}, innings {r.innings}
                        </div>
                        <TipRow label="High-pressure share" value={`${r.pressure_share}%`} />
                        <TipRow label="Average stakes" value={`${r.li.toFixed(2)}×`} />
                        <TipRow label="Deliveries" value={fmt.int(r.balls)} />
                      </div>
                    ),
                  })
                }}
                onPointerLeave={() => setTip(null)}
              />
              <text
                x={bx + x1.bandwidth() / 2}
                y={y(r.pressure_share) - 5}
                textAnchor="middle"
                fontSize={11}
                fill="var(--ink-2)"
                className="num"
              >
                {Math.round(r.pressure_share)}%
              </text>
            </g>
          )
        })}
        {phases.map((p) => (
          <text key={p} x={(x0(p) ?? 0) + x0.bandwidth() / 2} y={height - m.b + 17} textAnchor="middle" {...AXIS.label}>
            {p}
          </text>
        ))}
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  )
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return ''
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`
}
