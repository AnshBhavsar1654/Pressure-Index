import { InfoIcon } from '@phosphor-icons/react/dist/ssr'
import type { ReactNode } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

/** Page title with a one-sentence summary underneath; optional content on the right. */
export function PageHead({ title, summary, children }: { title: string; summary: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
      <div className="flex max-w-[72ch] flex-col gap-2.5">
        <h1 className="display text-[2.6rem] sm:text-[3.2rem]">{title}</h1>
        <p className="text-[16px] leading-relaxed text-ink-2">{summary}</p>
      </div>
      {children}
    </header>
  )
}

export function SectionHead({ title, children, id, action }: { title: string; children?: ReactNode; id?: string; action?: ReactNode }) {
  return (
    <div id={id} className="mb-4 mt-10 flex scroll-mt-24 flex-wrap items-end justify-between gap-3">
      <div className="flex max-w-[72ch] flex-col gap-1.5">
        <h2 className="display text-[1.95rem]">{title}</h2>
        {children && <p className="text-[14.5px] leading-relaxed text-ink-2">{children}</p>}
      </div>
      {action}
    </div>
  )
}

/** Short points instead of a paragraph: easier to scan. */
export function Bullets({ items, className }: { items: ReactNode[]; className?: string }) {
  return (
    <ul className={cn('flex flex-col gap-1.5 pl-5 text-[14.5px] leading-snug text-ink-2 marker:text-signal-ink [&_b]:text-ink', className)} style={{ listStyle: 'disc' }}>
      {items.filter(Boolean).map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  )
}

const TONE = { ink: 'text-foreground', signal: 'text-signal-ink', data: 'text-data-ink', hi: 'text-ink', white: 'text-white' }

export function Stat({
  label,
  value,
  note,
  tone = 'ink',
  className,
}: {
  label: string
  value: ReactNode
  note?: ReactNode
  tone?: keyof typeof TONE
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5 rounded-lg border border-line bg-panel-2 px-4 py-3.5', className)}>
      <span className="text-[13px] text-ink-3">{label}</span>
      <span className={cn('display num text-[2.1rem]', TONE[tone])}>{value}</span>
      {note && <span className="text-[12.5px] leading-snug text-ink-3">{note}</span>}
    </div>
  )
}

/** Initials in a thin ring: there are no player photos in the data, so identity is typographic. */
export function PlayerAvatar({ name, highlight = false, size = 40, className }: { name: string; highlight?: boolean; size?: number; className?: string }) {
  const parts = name.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean)
  const initials = (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.slice(0, 2) ?? '?').toUpperCase()
  return (
    <span
      aria-hidden
      className={cn('grid shrink-0 place-items-center rounded-full p-[2px]', highlight ? 'bg-signal' : 'bg-line-strong', className)}
      style={{ width: size, height: size }}
    >
      <span className="display grid size-full place-items-center rounded-full bg-panel-2 text-ink" style={{ fontSize: size * 0.4 }}>
        {initials}
      </span>
    </span>
  )
}

/** Rank in a mono numeral with a signal-coloured rule: a leaderboard position, not a trophy. */
export function RankRibbon({ rank, className }: { rank: number | string; className?: string }) {
  return (
    <span className={cn('flex w-16 flex-col items-center gap-1.5 pt-1', className)} aria-label={`Rank ${rank}`}>
      <span className="eyebrow">rank</span>
      <span className="display num text-[2.4rem] leading-none text-foreground">{rank}</span>
      <span className="h-[3px] w-8 rounded-full bg-signal" />
    </span>
  )
}

export function Note({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <Alert className={cn('rounded-lg border-line bg-panel-2', className)}>
      <InfoIcon weight="fill" className="text-data-ink" />
      <AlertTitle className="font-semibold">{title}</AlertTitle>
      <AlertDescription className="text-ink-2 [&_b]:text-foreground">{children}</AlertDescription>
    </Alert>
  )
}

/** Thin meter for shares such as "stays in the top 10". */
export function Meter({ value, tone = 'data', className }: { value: number; tone?: 'data' | 'signal' | 'hi'; className?: string }) {
  const bg = { data: 'bg-data', signal: 'bg-signal', hi: 'bg-hi' }[tone]
  return (
    <span className={cn('block h-1.5 overflow-hidden rounded-full bg-panel-2', className)} role="presentation">
      <span className={cn('block h-full rounded-full', bg)} style={{ width: `${Math.max(3, Math.min(100, value * 100))}%` }} />
    </span>
  )
}

export function signed(n: number | null | undefined, d = 1) {
  if (n == null || Number.isNaN(n)) return '–'
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(d)}`
}

export function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${s}`
}

const TAG = {
  neutral: 'bg-panel-2 text-ink-2 border-line',
  signal: 'bg-signal-soft text-signal-ink border-transparent',
  data: 'bg-data-soft text-data-ink border-transparent',
  hi: 'bg-hi-soft text-ink border-transparent',
}

/** Small coloured label for nationality, status and similar facts. */
export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: keyof typeof TAG }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11.5px] font-medium', TAG[tone])}>{children}</span>
}
