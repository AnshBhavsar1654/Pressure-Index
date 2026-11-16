'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Zoomable } from './Zoom'

/** Measure a container's width so SVG charts stay crisp at any size. */
export function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null)
  const [w, setW] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(Math.max(260, Math.floor(el.getBoundingClientRect().width)))
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.floor(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

export interface TipState {
  x: number
  y: number
  content: ReactNode
}

/** Positioned tooltip, kept inside the chart's box. */
export function Tooltip({ tip, width }: { tip: TipState | null; width: number }) {
  const el = useRef<HTMLDivElement>(null)
  // keep the box inside the chart vertically as well: a tooltip hanging past the bottom edge adds a
  // scrollbar to the zoom viewport, which narrows the chart under the cursor and makes it flicker
  useLayoutEffect(() => {
    const t = el.current
    const parent = t?.offsetParent as HTMLElement | null
    if (!t || !parent || !tip) return
    const room = parent.clientHeight - t.offsetHeight - 4
    t.style.top = `${Math.max(0, Math.min(tip.y - 12, room))}px`
  })
  if (!tip) return null
  const left = Math.min(Math.max(tip.x + 14, 4), width - 230)
  return (
    <div
      ref={el}
      role="status"
      className="pointer-events-none absolute z-20 w-[220px] rounded-lg border border-line-strong bg-panel-2 px-3 py-2 text-[12.5px] leading-snug text-ink"
      style={{ left, top: Math.max(tip.y - 12, 0) }}
    >
      {tip.content}
    </div>
  )
}

export function TipRow({ label, value, swatch }: { label: string; value: ReactNode; swatch?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-ink-2">
        {swatch && <span className="inline-block h-2 w-2 rounded-full" style={{ background: swatch }} />}
        {label}
      </span>
      <span className="num font-medium text-ink">{value}</span>
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string; shape?: 'dot' | 'line' }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          {it.shape === 'line' ? (
            <span className="inline-block h-[2px] w-4 rounded" style={{ background: it.color }} />
          ) : (
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: it.color }} />
          )}
          {it.label}
        </span>
      ))}
    </div>
  )
}

export const AXIS = {
  tick: { fontSize: 11, fill: 'var(--ink-3)' },
  label: { fontSize: 11.5, fill: 'var(--ink-2)' },
  grid: 'var(--line)',
  rule: 'var(--line-strong)',
}

export function ChartFrame({
  title,
  subtitle,
  legend,
  children,
  footnote,
  className = '',
}: {
  title: string
  subtitle?: ReactNode
  legend?: ReactNode
  children: ReactNode
  footnote?: ReactNode
  className?: string
}) {
  return (
    <figure className={`panel flex min-w-0 flex-col gap-3 p-5 ${className}`}>
      <figcaption className="flex flex-col gap-1">
        <h3 className="display text-[1.5rem] text-ink">{title}</h3>
        {subtitle && <p className="max-w-[68ch] text-[13px] leading-relaxed text-ink-2">{subtitle}</p>}
      </figcaption>
      {legend}
      <Zoomable label={title}>{children}</Zoomable>
      {footnote && <p className="text-[12px] leading-relaxed text-ink-3">{footnote}</p>}
    </figure>
  )
}
