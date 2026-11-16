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

const TONE = { ink: 'text-foreground', pink: 'text-pink', blue: 'text-blue', gold: 'text-gold', white: 'text-white' }

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
    <div className={cn('flex flex-col gap-1.5 rounded-2xl border border-line bg-panel-2/70 px-4 py-3.5', className)}>
      <span className="text-[13px] text-ink-3">{label}</span>
      <span className={cn('display num text-[2.1rem]', TONE[tone])}>{value}</span>
      {note && <span className="text-[12.5px] leading-snug text-ink-3">{note}</span>}
    </div>
  )
}

/** Initials in a gradient ring: there are no player photos in the data, so identity is typographic. */
export function PlayerAvatar({ name, rr = false, size = 40, className }: { name: string; rr?: boolean; size?: number; className?: string }) {
  const parts = name.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean)
  const initials = (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.slice(0, 2) ?? '?').toUpperCase()
  return (
    <span
      aria-hidden
      className={cn('grid shrink-0 place-items-center rounded-full p-[2px]', rr ? 'bg-gradient-to-br from-pink to-royal' : 'bg-gradient-to-br from-blue/70 to-royal', className)}
      style={{ width: size, height: size }}
    >
      <span className="display grid size-full place-items-center rounded-full bg-panel-2 text-ink" style={{ fontSize: size * 0.4 }}>
        {initials}
      </span>
    </span>
  )
}

/** Ribbon carrying a rank number, after the numbered banner on a team sheet. */
export function RankRibbon({ rank, className }: { rank: number; className?: string }) {
  return (
    <span className={cn('relative grid w-16 place-items-center pb-3 pt-2 text-white', className)} aria-label={`Rank ${rank}`}>
      <svg viewBox="0 0 64 84" className="absolute inset-0 size-full" preserveAspectRatio="none" aria-hidden>
        <path d="M0 0 H64 V84 L32 68 L0 84 Z" fill="url(#rib)" />
        <defs>
          <linearGradient id="rib" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f5c451" />
            <stop offset="1" stopColor="#d99a1c" />
          </linearGradient>
        </defs>
      </svg>
      <span className="display num relative text-[2.3rem] text-[#3a2600]">{rank}</span>
    </span>
  )
}

export function Note({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <Alert className={cn('rounded-2xl border-line bg-panel-2/70', className)}>
      <InfoIcon weight="fill" className="text-blue" />
      <AlertTitle className="font-semibold">{title}</AlertTitle>
      <AlertDescription className="text-ink-2 [&_b]:text-foreground">{children}</AlertDescription>
    </Alert>
  )
}

/** Thin meter for shares such as "stays in the top 10". */
export function Meter({ value, tone = 'blue', className }: { value: number; tone?: 'blue' | 'pink' | 'gold'; className?: string }) {
  const bg = { blue: 'bg-blue', pink: 'bg-pink', gold: 'bg-gold' }[tone]
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
  pink: 'bg-pink-soft text-pink-ink border-transparent',
  blue: 'bg-blue-soft text-blue border-transparent',
  gold: 'bg-gold-soft text-gold border-transparent',
}

/** Small coloured label for nationality, status and similar facts. */
export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: keyof typeof TAG }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-medium', TAG[tone])}>{children}</span>
}
