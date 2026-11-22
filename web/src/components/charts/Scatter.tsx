'use client'

import { scaleLinear } from 'd3-scale'
import { useState } from 'react'
import type { ScoredPlayer } from '@/lib/types'
import { fmt } from '@/lib/format'
import { AXIS, Tooltip, TipRow, useWidth, type TipState } from './core'
import { useZoom } from './Zoom'

interface Props {
  role?: 'bat' | 'bowl'
  players: ScoredPlayer[]
  highlight: Set<number>
  selected?: number | null
  onSelect?: (id: number) => void
  height?: number
}

/**
 * Baseline (x) vs pressure (y) run value per 100 balls. Points above the diagonal
 * lift under pressure; the top 10 by live score wear the orange accent.
 */
export function PressureScatter({ players, highlight, selected, onSelect, role = 'bat', height: baseHeight = 420 }: Props) {
  const height = baseHeight * useZoom()
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const m = { t: 16, r: 16, b: 44, l: 52 }
  const vals = players.flatMap((p) => [p.n_rv100, p.p_rv100])
  const lo = Math.min(...vals) - 2
  const hi = Math.max(...vals) + 2
  const x = scaleLinear().domain([lo, hi]).nice().range([m.l, width - m.r])
  const y = scaleLinear().domain([lo, hi]).nice().range([height - m.b, m.t])
  const [d0, d1] = x.domain()
  const ordered = [...players].sort((a, b) => Number(highlight.has(a.id)) - Number(highlight.has(b.id)))
  const labelled = players.filter((p) => highlight.has(p.id) || p.id === selected)

  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-x-clip">
      <svg width={width} height={height} role="img" aria-label="Baseline versus pressure run value scatter">
        {x.ticks(6).map((t) => (
          <g key={`x${t}`}>
            <line x1={x(t)} x2={x(t)} y1={m.t} y2={height - m.b} stroke={AXIS.grid} />
            <text x={x(t)} y={height - m.b + 16} textAnchor="middle" {...AXIS.tick} className="num">
              {fmt.signed(t, 0)}
            </text>
          </g>
        ))}
        {y.ticks(6).map((t) => (
          <g key={`y${t}`}>
            <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={AXIS.grid} />
            <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" {...AXIS.tick} className="num">
              {fmt.signed(t, 0)}
            </text>
          </g>
        ))}
        {/* y = x: same level under pressure as normally */}
        <line x1={x(d0)} y1={y(d0)} x2={x(d1)} y2={y(d1)} stroke="var(--ink-3)" strokeWidth={1} />
        <text x={x(d1) - 6} y={y(d1) + 14} textAnchor="end" {...AXIS.label}>
          same as baseline
        </text>
        <text x={m.l + 8} y={m.t + 12} {...AXIS.label} fill="var(--signal)" fontWeight={600}>
          ↑ better under pressure
        </text>
        <text x={width - m.r - 8} y={height - m.b - 8} textAnchor="end" {...AXIS.label} fill="var(--data)" fontWeight={600}>
          worse under pressure ↓
        </text>
        <text x={(m.l + width - m.r) / 2} y={height - 6} textAnchor="middle" {...AXIS.label}>
          Normal moments: runs {role === 'bat' ? 'added' : 'saved'} per 100 balls
        </text>
        <text transform={`translate(13 ${(m.t + height - m.b) / 2}) rotate(-90)`} textAnchor="middle" {...AXIS.label}>
          Under pressure: runs {role === 'bat' ? 'added' : 'saved'} per 100 pressure balls
        </text>
        {ordered.map((p) => {
          const top = highlight.has(p.id)
          const isSel = p.id === selected || p.id === hover
          const r = Math.max(4, Math.min(9, Math.sqrt(p.p_balls) / 2.6))
          return (
            <circle
              key={p.id}
              cx={x(p.n_rv100)}
              cy={y(p.p_rv100)}
              r={isSel ? r + 2 : r}
              fill={top ? 'var(--signal)' : 'var(--neutral-mark)'}
              fillOpacity={top ? 0.95 : 0.75}
              stroke={isSel ? 'var(--ink)' : 'var(--surface)'}
              strokeWidth={isSel ? 2 : 1.5}
              style={{ cursor: onSelect ? 'pointer' : 'default' }}
              onClick={() => onSelect?.(p.id)}
              onPointerEnter={(e) => {
                const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
                setHover(p.id)
                setTip({
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                  content: (
                    <div className="flex flex-col gap-1">
                      <div className="font-semibold">
                        {p.liveRank != null ? `#${p.liveRank} ` : ''}
                        {p.name}
                      </div>
                      <TipRow label="Under pressure" value={fmt.signed(p.p_rv100)} />
                      <TipRow label="Normal" value={fmt.signed(p.n_rv100)} />
                      <TipRow label="Pressure balls" value={fmt.int(p.p_balls)} />
                      {p.boot && <TipRow label="Top-10 confidence" value={fmt.pct(p.boot.p_top10)} />}
                    </div>
                  ),
                })
              }}
              onPointerLeave={() => {
                setHover(null)
                setTip(null)
              }}
            />
          )
        })}
        {labelled.map((p) => (
          <text
            key={`l${p.id}`}
            x={x(p.n_rv100) + 9}
            y={y(p.p_rv100)}
            dy="0.32em"
            fontSize={11}
            fill="var(--ink)"
            stroke="var(--surface)"
            strokeWidth={3}
            paintOrder="stroke"
            pointerEvents="none"
          >
            {p.name.split(' ').slice(-1)[0]}
          </text>
        ))}
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  )
}
