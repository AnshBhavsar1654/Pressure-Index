import { scaleLinear } from 'd3-scale'
import { line, curveMonotoneX } from 'd3-shape'
import { useState } from 'react'
import { AXIS, Tooltip, TipRow, useWidth, type TipState } from './core'

export interface Series {
  key: string
  label: string
  color: string
  points: { x: number; y: number | null; n?: number }[]
}

interface Props {
  series: Series[]
  height?: number
  xLabel?: string
  yLabel?: string
  xTicks?: number[]
  xFormat?: (x: number) => string
  yFormat?: (y: number) => string
  refY?: { y: number; label: string }
  zeroLine?: boolean
  showPoints?: boolean
}

export function LineChart({
  series,
  height = 260,
  xLabel,
  yLabel,
  xTicks,
  xFormat = (x) => String(x),
  yFormat = (y) => y.toFixed(1),
  refY,
  zeroLine,
  showPoints = false,
}: Props) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState | null>(null)
  const [hoverX, setHoverX] = useState<number | null>(null)
  const m = { t: 12, r: 16, b: xLabel ? 40 : 26, l: 46 }
  const xs = series.flatMap((s) => s.points.map((p) => p.x))
  const ys = series.flatMap((s) => s.points.map((p) => p.y).filter((y): y is number => y != null))
  if (refY) ys.push(refY.y)
  if (zeroLine) ys.push(0)
  const x = scaleLinear()
    .domain([Math.min(...xs), Math.max(...xs)])
    .range([m.l, width - m.r])
  const y = scaleLinear()
    .domain([Math.min(...ys), Math.max(...ys)])
    .nice()
    .range([height - m.b, m.t])
  const gen = line<{ x: number; y: number | null }>()
    .defined((d) => d.y != null)
    .x((d) => x(d.x))
    .y((d) => y(d.y as number))
    .curve(curveMonotoneX)
  const uniqX = [...new Set(xs)].sort((a, b) => a - b)

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
    const px = e.clientX - rect.left
    const xv = x.invert(px)
    const nearest = uniqX.reduce((a, b) => (Math.abs(b - xv) < Math.abs(a - xv) ? b : a), uniqX[0])
    setHoverX(nearest)
    setTip({
      x: x(nearest),
      y: e.clientY - rect.top,
      content: (
        <div className="flex flex-col gap-1">
          <div className="font-semibold">{xFormat(nearest)}</div>
          {series.map((s) => {
            const p = s.points.find((pp) => pp.x === nearest)
            return (
              <TipRow
                key={s.key}
                swatch={s.color}
                label={s.label}
                value={p?.y == null ? '–' : `${yFormat(p.y)}${p.n != null ? ` (${p.n} b)` : ''}`}
              />
            )
          })}
        </div>
      ),
    })
  }

  return (
    <div ref={ref} className="relative w-full">
      <svg width={width} height={height} role="img" aria-label={`${yLabel ?? ''} by ${xLabel ?? ''}`}>
        {y.ticks(5).map((t) => (
          <g key={t}>
            <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={AXIS.grid} strokeWidth={1} />
            <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" {...AXIS.tick} className="num">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {zeroLine && <line x1={m.l} x2={width - m.r} y1={y(0)} y2={y(0)} stroke={AXIS.rule} />}
        {refY && (
          <g>
            <line x1={m.l} x2={width - m.r} y1={y(refY.y)} y2={y(refY.y)} stroke="var(--ink-3)" strokeWidth={1} />
            <text x={width - m.r} y={y(refY.y) - 5} textAnchor="end" {...AXIS.label}>
              {refY.label}
            </text>
          </g>
        )}
        {(xTicks ?? x.ticks(8)).map((t) => (
          <text key={t} x={x(t)} y={height - m.b + 16} textAnchor="middle" {...AXIS.tick} className="num">
            {xFormat(t)}
          </text>
        ))}
        {xLabel && (
          <text x={(m.l + width - m.r) / 2} y={height - 4} textAnchor="middle" {...AXIS.label}>
            {xLabel}
          </text>
        )}
        {yLabel && (
          <text transform={`translate(12 ${(m.t + height - m.b) / 2}) rotate(-90)`} textAnchor="middle" {...AXIS.label}>
            {yLabel}
          </text>
        )}
        {hoverX != null && (
          <line x1={x(hoverX)} x2={x(hoverX)} y1={m.t} y2={height - m.b} stroke="var(--ink-3)" strokeWidth={1} />
        )}
        {series.map((s) => (
          <g key={s.key}>
            <path d={gen(s.points) ?? ''} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
            {(showPoints || hoverX != null) &&
              s.points
                .filter((p) => p.y != null && (showPoints || p.x === hoverX))
                .map((p) => (
                  <circle
                    key={p.x}
                    cx={x(p.x)}
                    cy={y(p.y as number)}
                    r={4}
                    fill={s.color}
                    stroke="var(--surface)"
                    strokeWidth={2}
                  />
                ))}
          </g>
        ))}
        <rect
          x={m.l}
          y={m.t}
          width={Math.max(0, width - m.l - m.r)}
          height={Math.max(0, height - m.t - m.b)}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => {
            setTip(null)
            setHoverX(null)
          }}
        />
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  )
}
