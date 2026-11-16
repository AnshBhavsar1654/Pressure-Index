'use client'

import { scaleLinear } from 'd3-scale'
import { area, curveMonotoneX, line } from 'd3-shape'
import { useMemo, useState } from 'react'
import { AXIS, Tooltip, useWidth, type TipState } from './core'

type W = [number, number, number, number] // idx, RR win prob, pressure flag, innings

/**
 * RR's win probability through one match. The line draws itself once on load
 * (the page's single orchestrated motion); high-pressure deliveries are lit pink.
 */
export function WinWorm({
  worm,
  height = 300,
  animate = false,
  compact = false,
  labels,
}: {
  worm: W[]
  height?: number
  animate?: boolean
  compact?: boolean
  labels?: { first: string; second: string }
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const m = compact ? { t: 4, r: 4, b: 4, l: 4 } : { t: 18, r: 14, b: 28, l: 40 }
  const n = worm.length
  const x = scaleLinear().domain([0, n - 1]).range([m.l, width - m.r])
  const y = scaleLinear().domain([0, 1]).range([height - m.b, m.t])
  const split = worm.findIndex((w) => w[3] === 2)
  const pts = useMemo(() => worm.map((w) => ({ i: w[0], p: w[1] })), [worm])
  const path = line<{ i: number; p: number }>().x((d) => x(d.i)).y((d) => y(d.p)).curve(curveMonotoneX)(pts) ?? ''
  const fillUp = area<{ i: number; p: number }>().x((d) => x(d.i)).y0(y(0.5)).y1((d) => y(Math.max(d.p, 0.5))).curve(curveMonotoneX)(pts) ?? ''
  const fillDn = area<{ i: number; p: number }>().x((d) => x(d.i)).y0(y(0.5)).y1((d) => y(Math.min(d.p, 0.5))).curve(curveMonotoneX)(pts) ?? ''
  const press = worm.filter((w) => w[2] === 1)
  // per-innings ball counter for the tooltip
  const ballInInnings = (i: number) => (split > 0 && i >= split ? i - split + 1 : i + 1)

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    if (compact) return
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
    const i = Math.max(0, Math.min(n - 1, Math.round(x.invert(e.clientX - rect.left))))
    const w = worm[i]
    setHover(i)
    setTip({
      x: x(i),
      y: y(w[1]) - 10,
      content: (
        <div className="flex flex-col gap-0.5">
          <div className="font-semibold">
            {w[3] === 1 ? labels?.first ?? 'First innings' : labels?.second ?? 'Second innings'}, delivery {ballInInnings(i)}
          </div>
          <div>
            RR win chance <b className="num">{Math.round(w[1] * 100)}%</b>
          </div>
          {w[2] === 1 && <div className="font-medium text-pink-ink">High-pressure ball</div>}
        </div>
      ),
    })
  }

  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-x-clip">
      <svg width={width} height={height} role="img" aria-label="Rajasthan Royals win probability through the match">
        <defs>
          <clipPath id={`clip-${n}-${height}`}>
            <rect x={m.l} y={m.t} width={Math.max(0, width - m.l - m.r)} height={height - m.t - m.b} />
          </clipPath>
        </defs>
        {!compact &&
          [0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={t === 0.5 ? AXIS.rule : AXIS.grid} />
              <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" {...AXIS.tick} className="num">
                {t * 100}%
              </text>
            </g>
          ))}
        {compact && <line x1={m.l} x2={width - m.r} y1={y(0.5)} y2={y(0.5)} stroke={AXIS.grid} />}
        {/* pressure balls: thin pink ticks along the base so they never hide the line */}
        <g className={animate ? 'worm-fade' : undefined}>
          {press.map((w) => (
            <rect
              key={w[0]}
              x={x(w[0]) - Math.max(0.8, (width - m.l - m.r) / n / 2)}
              y={m.t}
              width={Math.max(1.6, (width - m.l - m.r) / n)}
              height={height - m.t - m.b}
              fill="var(--pink)"
              opacity={0.1}
            />
          ))}
        </g>
        <g clipPath={`url(#clip-${n}-${height})`}>
          <path d={fillUp} fill="var(--pink)" opacity={0.13} className={animate ? 'worm-fade' : undefined} />
          <path d={fillDn} fill="var(--blue)" opacity={0.13} className={animate ? 'worm-fade' : undefined} />
        </g>
        {split > 0 && (
          <g>
            <line x1={x(split - 0.5)} x2={x(split - 0.5)} y1={m.t} y2={height - m.b} stroke="var(--ink-3)" strokeWidth={1} />
            {!compact && (
              <text x={x(split - 0.5) + 6} y={m.t + 2} dy="0.7em" {...AXIS.label}>
                innings break
              </text>
            )}
          </g>
        )}
        <path
          d={path}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={compact ? 1.5 : 2.25}
          strokeLinejoin="round"
          pathLength={animate ? 1 : undefined}
          className={animate ? 'worm-draw' : undefined}
        />
        {!compact && (
          <>
            <text x={width - m.r} y={y(0.97)} textAnchor="end" {...AXIS.label} fill="var(--pink-ink)" fontWeight={600}>
              RR ahead
            </text>
            <text x={width - m.r} y={y(0.03)} textAnchor="end" {...AXIS.label} fill="var(--blue)" fontWeight={600}>
              opposition ahead
            </text>
          </>
        )}
        {hover != null && (
          <circle cx={x(hover)} cy={y(worm[hover][1])} r={5} fill="var(--ink)" stroke="var(--panel)" strokeWidth={2} />
        )}
        {!compact && (
          <rect
            x={m.l}
            y={m.t}
            width={Math.max(0, width - m.l - m.r)}
            height={height - m.t - m.b}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => {
              setTip(null)
              setHover(null)
            }}
          />
        )}
      </svg>
      {!compact && <Tooltip tip={tip} width={width} />}
    </div>
  )
}
