'use client'

import { scaleLinear } from 'd3-scale'
import { curveMonotoneX, line } from 'd3-shape'
import { useId, useState } from 'react'
import { AXIS, Tooltip, TipRow, useWidth } from './core'

type Delivery = [number, number, number, number] // index, batting-first win probability, pressure flag, innings

const FIRST = 'var(--ink)'
const SECOND = 'var(--data-ink)'
const DASH = '6 4'

export function WinWorm({
  worm,
  teams,
  height = 300,
  highlight,
}: {
  worm: Delivery[]
  teams: [string, string]
  height?: number
  highlight?: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const keyboardHelp = useId()
  const [active, setActive] = useState<number | null>(null)
  const m = { t: 16, r: 12, b: 28, l: 40 }
  const bottom = height - m.b
  const plotWidth = width - m.l - m.r
  const n = worm.length
  const x = scaleLinear().domain([0, Math.max(1, n - 1)]).range([m.l, width - m.r])
  const y = scaleLinear().domain([0, 1]).range([bottom, m.t])
  const split = worm.findIndex((ball) => ball[3] === 2)
  const trace = line<Delivery>().x(([index]) => x(index)).curve(curveMonotoneX)
  const firstTrace = trace.y(([, probability]) => y(probability))(worm)
  const secondTrace = trace.y(([, probability]) => y(1 - probability))(worm)

  const fallback = highlight != null && worm[highlight] ? highlight : 0
  const selectedIndex = active ?? fallback
  const selected = worm[selectedIndex]
  const marked = active != null ? selected : highlight == null ? undefined : worm[highlight]
  const guide = active == null ? 'var(--pressure-highlight)' : 'var(--pressure-mark)'
  const firstPercent = selected ? Math.round(selected[1] * 100) : 0
  const secondPercent = 100 - firstPercent
  const innings = selected?.[3] === 2 ? 'Second innings' : 'First innings'
  const delivery = selectedIndex - (split > 0 && selectedIndex >= split ? split : 0) + 1

  function select(index: number) {
    setActive(Math.max(0, Math.min(n - 1, index)))
  }

  function selectPointer(event: React.PointerEvent<SVGRectElement>) {
    const svg = event.currentTarget.ownerSVGElement
    if (svg) select(Math.round(x.invert(event.clientX - svg.getBoundingClientRect().left)))
  }

  function selectKey(event: React.KeyboardEvent<SVGRectElement>) {
    const indexByKey: Record<string, number> = {
      ArrowLeft: selectedIndex - 1,
      ArrowDown: selectedIndex - 1,
      ArrowRight: selectedIndex + 1,
      ArrowUp: selectedIndex + 1,
      Home: 0,
      End: n - 1,
    }
    const index = indexByKey[event.key]
    if (index == null) return
    event.preventDefault()
    select(index)
  }

  if (!n) return <p className="px-2 py-6 text-sm text-ink-2">No deliveries available for this match.</p>

  return (
    <>
      <span id={keyboardHelp} className="sr-only">Use the arrow keys to move between deliveries.</span>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pl-1 text-xs text-ink-2">
        {teams.map((team, index) => (
          <span key={team} className="flex items-center gap-2">
            <svg width="20" height="6" aria-hidden="true">
              <line x1="0" x2="20" y1="3" y2="3" stroke={index === 0 ? FIRST : SECOND} strokeWidth="2" strokeDasharray={index === 0 ? undefined : DASH} />
            </svg>
            {team}
          </span>
        ))}
        <span className="flex items-center gap-2"><span aria-hidden="true" className="h-1 w-4 bg-[var(--pressure-mark)]" />Pressure deliveries</span>
      </div>
      <div ref={ref} className="relative w-full min-w-0 overflow-x-clip">
        <svg width={width} height={height} role="group" aria-label={`Win probability for ${teams[0]} and ${teams[1]}`}>
          <g aria-hidden="true">
            {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
              <g key={tick}>
                <line x1={m.l} x2={width - m.r} y1={y(tick)} y2={y(tick)} stroke={tick === 0.5 ? AXIS.rule : AXIS.grid} />
                <text x={m.l - 8} y={y(tick)} dy="0.32em" textAnchor="end" {...AXIS.tick} className="num">{tick * 100}%</text>
              </g>
            ))}
            {worm.filter((ball) => ball[2] === 1).map(([index]) => (
              <rect key={index} x={x(index)} y={bottom + 5} width={Math.max(1, plotWidth / n * 0.8)} height={5} fill="var(--pressure-mark)" />
            ))}
            {split > 0 && (
              <>
                <line x1={x(split - 0.5)} x2={x(split - 0.5)} y1={m.t} y2={bottom} stroke={AXIS.rule} />
                <text x={x(split - 0.5)} y={height - 2} textAnchor="middle" {...AXIS.label}>Innings break</text>
              </>
            )}
            <path d={firstTrace ?? undefined} fill="none" stroke={FIRST} strokeWidth={2.25} strokeLinejoin="round" />
            <path d={secondTrace ?? undefined} fill="none" stroke={SECOND} strokeWidth={2.25} strokeLinejoin="round" strokeDasharray={DASH} />
            {marked && (
              <>
                <line x1={x(marked[0])} x2={x(marked[0])} y1={m.t} y2={bottom} stroke={guide} strokeWidth={active == null ? 2 : 1} />
                <circle cx={x(marked[0])} cy={y(marked[1])} r={4} fill={FIRST} stroke="var(--panel)" strokeWidth={1.5} />
                <circle cx={x(marked[0])} cy={y(1 - marked[1])} r={4} fill="var(--panel)" stroke={SECOND} strokeWidth={2} />
              </>
            )}
          </g>
          <rect
            x={m.l}
            y={m.t}
            width={plotWidth}
            height={bottom - m.t}
            fill="transparent"
            className="focus-visible:[stroke:var(--signal-ink)] focus-visible:[stroke-width:2px]"
            tabIndex={0}
            role="slider"
            aria-label="Match delivery"
            aria-describedby={keyboardHelp}
            aria-valuemin={1}
            aria-valuemax={n}
            aria-valuenow={selectedIndex + 1}
            aria-valuetext={`${innings}, delivery ${delivery}. ${teams[0]} ${firstPercent}%, ${teams[1]} ${secondPercent}%`}
            onFocus={() => setActive((index) => index ?? fallback)}
            onBlur={() => setActive(null)}
            onKeyDown={selectKey}
            onPointerDown={selectPointer}
            onPointerMove={(event) => {
              if (event.pointerType !== 'touch') selectPointer(event)
            }}
            onPointerLeave={(event) => {
              if (event.pointerType !== 'touch' && document.activeElement !== event.currentTarget) setActive(null)
            }}
          />
        </svg>
        <Tooltip width={width} tip={active != null && selected ? {
          x: x(selected[0]),
          y: Math.min(y(selected[1]), y(1 - selected[1])),
          content: (
            <div className="grid gap-1">
              <div className="font-semibold">{innings}, delivery {delivery}</div>
              <TipRow label={teams[0]} value={`${firstPercent}%`} swatch={FIRST} />
              <TipRow label={teams[1]} value={`${secondPercent}%`} swatch={SECOND} />
              {selected[2] === 1 && <div className="text-ink-3">Pressure delivery</div>}
            </div>
          ),
        } : null} />
      </div>
    </>
  )
}
