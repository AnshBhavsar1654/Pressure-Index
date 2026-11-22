'use client'

import { scaleBand, scaleLinear } from 'd3-scale'
import { useMemo, useState } from 'react'
import type { ChaseGrid } from '@/lib/types'
import { fmt } from '@/lib/format'
import { AXIS, Tooltip, TipRow, useWidth, type TipState } from './core'
import { useZoom } from './Zoom'

/**
 * Chase pressure map: overs left (x, counting down) by runs needed (y), shaded by
 * Leverage Index for a chosen number of wickets in hand. One hue (orange), light to dark,
 * expressed as opacity over the surface so it stays correct in both themes.
 */
export function ChaseHeatmap({ grid, wkts, maxNeed = 200 }: { grid: ChaseGrid; wkts: number; maxNeed?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState | null>(null)
  const rows = useMemo(() => grid.rows.filter((r) => r[0] === wkts && r[2] <= maxNeed), [grid, wkts, maxNeed])
  const overs = Array.from({ length: 20 }, (_, i) => 20 - i)
  const needs = [...new Set(rows.map((r) => r[2]))].sort((a, b) => b - a)
  const height = 380 * useZoom()
  const m = { t: 8, r: 64, b: 40, l: 46 }
  const x = scaleBand<number>().domain(overs).range([m.l, width - m.r]).paddingInner(0.06)
  const y = scaleBand<number>().domain(needs).range([m.t, height - m.b]).paddingInner(0.06)
  const op = scaleLinear().domain([0, 1, 4]).range([0.04, 0.35, 1]).clamp(true)
  const legendStops = [0, 0.5, 1, 2, 3, 4]

  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-x-clip">
      <svg width={width} height={height} role="img" aria-label={`Chase leverage map with ${wkts} wickets in hand`}>
        <rect x={m.l} y={m.t} width={width - m.l - m.r} height={height - m.t - m.b} fill="var(--surface-2)" />
        {rows.map(([, ov, need, wp, li]) => (
          <rect
            key={`${ov}-${need}`}
            x={x(ov)}
            y={y(need)}
            width={x.bandwidth()}
            height={y.bandwidth()}
            fill="var(--signal)"
            fillOpacity={op(li)}
            onPointerEnter={(e) => {
              const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
              setTip({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
                content: (
                  <div className="flex flex-col gap-1">
                    <div className="font-semibold">
                      {need} needed, {ov} overs left
                    </div>
                    <TipRow label="Required rate" value={(need / ov).toFixed(1)} />
                    <TipRow label="Chase win probability" value={fmt.pct(wp)} />
                    <TipRow label="Stakes" value={`${li.toFixed(1)}× a typical ball`} />
                  </div>
                ),
              })
            }}
            onPointerLeave={() => setTip(null)}
          />
        ))}
        {overs
          .filter((o) => o % 2 === 0 || o === 1)
          .map((o) => (
            <text key={o} x={(x(o) ?? 0) + x.bandwidth() / 2} y={height - m.b + 15} textAnchor="middle" {...AXIS.tick} className="num">
              {o}
            </text>
          ))}
        {needs
          .filter((_, i) => i % 3 === 0)
          .map((n) => (
            <text key={n} x={m.l - 8} y={(y(n) ?? 0) + y.bandwidth() / 2} dy="0.32em" textAnchor="end" {...AXIS.tick} className="num">
              {n}
            </text>
          ))}
        <text x={(m.l + width - m.r) / 2} y={height - 5} textAnchor="middle" {...AXIS.label}>
          Overs left in the chase
        </text>
        <text transform={`translate(12 ${(m.t + height - m.b) / 2}) rotate(-90)`} textAnchor="middle" {...AXIS.label}>
          Runs needed
        </text>
        {/* scale legend */}
        <g transform={`translate(${width - m.r + 14} ${m.t})`}>
          <text x={0} y={8} {...AXIS.label}>
            Stakes
          </text>
          {legendStops.map((s, i) => (
            <g key={s} transform={`translate(0 ${18 + i * 22})`}>
              <rect width={14} height={18} fill="var(--surface-2)" />
              <rect width={14} height={18} fill="var(--signal)" fillOpacity={op(s)} />
              <text x={20} y={9} dy="0.32em" {...AXIS.tick} className="num">
                {s === 4 ? '4+' : s}
              </text>
            </g>
          ))}
        </g>
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  )
}
