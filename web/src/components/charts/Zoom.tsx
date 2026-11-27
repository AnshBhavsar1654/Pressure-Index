'use client'

import { ArrowsInIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon } from '@phosphor-icons/react'
import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ZoomCtx = createContext(1)
/** Current zoom factor. Charts that should also grow taller multiply their height by it. */
export const useZoom = () => useContext(ZoomCtx)

const STEPS = [1, 1.5, 2, 3, 4]

/**
 * Zoom wrapper for SVG charts. Zooming re-renders the chart wider (and, for charts that
 * opt in through useZoom, taller) inside a scrollable viewport, so lines stay sharp and
 * labels keep their size. Drag to pan when zoomed in.
 */
export function Zoomable({ children, heading, label = 'chart', className }: { children: ReactNode; heading?: ReactNode; label?: string; className?: string }) {
  const [step, setStep] = useState(0)
  const zoom = STEPS[step]
  const view = useRef<HTMLDivElement>(null)
  const prev = useRef(zoom)
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null)

  // keep the centre of the view in place when the zoom changes
  useLayoutEffect(() => {
    const el = view.current
    if (!el || prev.current === zoom) return
    const r = zoom / prev.current
    el.scrollLeft = (el.scrollLeft + el.clientWidth / 2) * r - el.clientWidth / 2
    el.scrollTop = (el.scrollTop + el.clientHeight / 2) * r - el.clientHeight / 2
    prev.current = zoom
  }, [zoom])

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoom === 1 || e.button !== 0 || !view.current) return
    drag.current = { x: e.clientX, y: e.clientY, left: view.current.scrollLeft, top: view.current.scrollTop, moved: false }
  }
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || !view.current) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    d.moved = true
    view.current.scrollLeft = d.left - dx
    view.current.scrollTop = d.top - dy
  }
  const onUp = () => {
    drag.current = null
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {heading}
        <div className="ml-auto flex items-center gap-1" role="group" aria-label={`Zoom ${label}`}>
          <Button variant="outline" size="icon-sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} aria-label="Zoom out">
            <MagnifyingGlassMinusIcon />
          </Button>
          <span className="num w-12 text-center text-[12.5px] text-ink-3" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="outline" size="icon-sm" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} disabled={step === STEPS.length - 1} aria-label="Zoom in">
            <MagnifyingGlassPlusIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setStep(0)} disabled={step === 0} aria-label="Reset zoom">
            <ArrowsInIcon />
          </Button>
        </div>
      </div>
      <div
        ref={view}
        className={cn('relative min-w-0 overflow-auto overscroll-contain', zoom > 1 && 'cursor-grab rounded-lg border border-line active:cursor-grabbing')}
        style={zoom > 1 ? { maxHeight: '70vh' } : undefined}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        <div style={{ width: `${zoom * 100}%` }}>
          <ZoomCtx.Provider value={zoom}>{children}</ZoomCtx.Provider>
        </div>
      </div>
    </div>
  )
}
