import type { ReactNode } from 'react'

/**
 * Every page opens with a title and one plain-language sentence that answers
 * "what should I take away from this screen?" so the dashboard presents itself.
 */
export function PageHead({ title, takeaway, children }: { title: string; takeaway: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div className="flex max-w-[70ch] flex-col gap-3">
        <h1 className="display text-[2.7rem] text-ink sm:text-[3.3rem]">{title}</h1>
        <p className="text-[16px] leading-relaxed text-ink-2">{takeaway}</p>
      </div>
      {children}
    </header>
  )
}

export function SectionHead({ title, children, id }: { title: string; children?: ReactNode; id?: string }) {
  return (
    <div id={id} className="mb-4 mt-12 flex max-w-[72ch] scroll-mt-20 flex-col gap-1.5">
      <h2 className="display text-[1.9rem] text-ink">{title}</h2>
      {children && <p className="text-[14.5px] leading-relaxed text-ink-2">{children}</p>}
    </div>
  )
}

export function Stat({
  label,
  value,
  note,
  tone = 'ink',
}: {
  label: string
  value: ReactNode
  note?: ReactNode
  tone?: 'ink' | 'pink' | 'blue' | 'gold'
}) {
  const color = { ink: 'text-ink', pink: 'text-pink', blue: 'text-blue', gold: 'text-gold' }[tone]
  return (
    <div className="flex flex-col gap-1.5 bg-panel px-4 py-3.5">
      <span className="text-[13px] text-ink-3">{label}</span>
      <span className={`display num text-[2.1rem] ${color}`}>{value}</span>
      {note && <span className="text-[12.5px] leading-snug text-ink-3">{note}</span>}
    </div>
  )
}

export function StatRow({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 | 5 }) {
  const c = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 xl:grid-cols-4', 5: 'sm:grid-cols-3 xl:grid-cols-5' }[cols]
  return <div className={`grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line ${c}`}>{children}</div>
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'pink' | 'blue' | 'gold' }) {
  const cls = {
    neutral: 'bg-panel-2 text-ink-2 border-line',
    pink: 'bg-pink-soft text-pink-ink border-transparent',
    blue: 'bg-blue-soft text-blue border-transparent',
    gold: 'bg-gold-soft text-gold border-transparent',
  }[tone]
  return <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11.5px] font-medium ${cls}`}>{children}</span>
}

/** A short plain-language explainer box used across pages ("In plain words"). */
export function Plain({ title = 'In plain words', children }: { title?: string; children: ReactNode }) {
  return (
    <aside className="rounded-[10px] border border-blue/25 bg-blue-soft/50 px-4 py-3.5 text-[14px] leading-relaxed text-ink">
      <div className="mb-1 font-semibold text-blue">{title}</div>
      <div className="text-ink-2 [&_b]:text-ink">{children}</div>
    </aside>
  )
}

export function signed(n: number | null | undefined, d = 1) {
  if (n == null || Number.isNaN(n)) return '–'
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(d)}`
}
