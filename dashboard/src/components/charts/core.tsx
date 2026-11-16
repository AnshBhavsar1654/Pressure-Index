import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Measure a container's width so SVG charts stay crisp at any size. */
export function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null)
  const [w, setW] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
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
  if (!tip) return null
  const left = Math.min(Math.max(tip.x + 14, 4), width - 230)
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-20 w-[220px] rounded-[3px] border border-line-strong bg-surface px-3 py-2 text-[12.5px] leading-snug text-ink"
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
    <figure className={`panel flex flex-col gap-3 p-4 sm:p-5 ${className}`}>
      <figcaption className="flex flex-col gap-1">
        <h3 className="display text-[1.3rem] font-semibold leading-tight text-ink">{title}</h3>
        {subtitle && <p className="max-w-[68ch] text-[13px] leading-relaxed text-ink-2">{subtitle}</p>}
      </figcaption>
      {legend}
      <div className="relative">{children}</div>
      {footnote && <p className="text-[12px] leading-relaxed text-ink-3">{footnote}</p>}
    </figure>
  )
}
