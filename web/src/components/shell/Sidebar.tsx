'use client'

import {
  BookOpenTextIcon,
  ChartScatterIcon,
  DatabaseIcon,
  FlaskIcon,
  HouseIcon,
  LightbulbIcon,
  PulseIcon,
  ScalesIcon,
  ShieldIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ComponentType } from 'react'
import { BallIcon, BatIcon } from '@/components/icons'
import { cn } from '@/lib/utils'

type Item = { href: string; label: string; icon: ComponentType<{ size?: number | string; weight?: 'regular' | 'fill' }> }
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Project',
    items: [
      { href: '/', label: 'Overview', icon: HouseIcon },
      { href: '/lab/', label: 'Model Lab', icon: FlaskIcon },
      { href: '/method/', label: 'Methodology', icon: BookOpenTextIcon },
      { href: '/sources/', label: 'Data & pipeline', icon: DatabaseIcon },
    ],
  },
  {
    title: 'Ratings',
    items: [
      { href: '/rankings/bat/', label: 'Batters', icon: BatIcon },
      { href: '/rankings/bowl/', label: 'Bowlers', icon: BallIcon },
      { href: '/players/', label: 'All players', icon: UsersThreeIcon },
      { href: '/compare/', label: 'Compare', icon: ScalesIcon },
    ],
  },
  {
    title: 'Analysis',
    items: [
      { href: '/matches/', label: 'Match explorer', icon: PulseIcon },
      { href: '/teams/', label: 'IPL teams', icon: ShieldIcon },
      { href: '/insights/', label: 'Insights', icon: LightbulbIcon },
      { href: '/insights/#archetypes', label: 'Archetypes', icon: ChartScatterIcon },
    ],
  },
]

/** The mark: a win-probability trace that spikes where the stakes are highest, on a slate tile. */
export function Mark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="8" fill="#121821" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="rgba(148,163,184,0.35)" />
      <path d="M5 19 L10 18 L13 20 L16.5 8 L19 24 L21.5 15 L27 14" fill="none" stroke="#e8642a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16.5" cy="8" r="2" fill="#4fd1c0" />
    </svg>
  )
}

export function Sidebar() {
  const path = usePathname()
  const active = (href: string) => {
    if (href === '/') return path === '/'
    if (href.includes('#')) return false
    if (href === '/players/') return path === '/players/' || path === '/players'
    if (href.startsWith('/rankings/')) {
      const role = href.split('/')[2]
      return path.startsWith(href) || path.startsWith(`/players/${role}/`)
    }
    return path.startsWith(href)
  }

  return (
    <aside className="panel sticky top-5 hidden h-[calc(100dvh-2.5rem)] w-[232px] shrink-0 flex-col overflow-y-auto bg-rail! p-4 lg:flex">
      <Link href="/" className="flex items-center gap-3 px-1 pb-6 pt-1" aria-label="Pressure Index home">
        <Mark />
        <span className="flex flex-col leading-none">
          <span className="display text-[1.15rem]">Pressure Index</span>
          <span className="eyebrow mt-1 text-[10px]">T20 ML analytics</span>
        </span>
      </Link>
      <nav aria-label="Sections" className="flex flex-col gap-5">
        {GROUPS.map((g) => (
          <div key={g.title} className="flex flex-col gap-0.5">
            <span className="eyebrow px-3 pb-1.5">{g.title}</span>
            {g.items.map((it) => {
              const on = active(it.href)
              const I = it.icon
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-[14px] font-medium transition-colors duration-150',
                    on ? 'bg-panel-2 text-rail-ink' : 'text-rail-dim hover:bg-panel-2 hover:text-rail-ink',
                  )}
                >
                  {on && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-signal" />}
                  <I size={18} weight={on ? 'fill' : 'regular'} />
                  {it.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
      <div className="mt-auto rounded-lg border border-line p-3 text-[12px] leading-snug text-ink-3">
        Built on open <a className="text-ink-2 underline decoration-dotted underline-offset-2 hover:text-foreground" href="https://cricsheet.org">Cricsheet</a> data. Python + scikit-learn pipeline, Next.js dashboard.
      </div>
    </aside>
  )
}

export const NAV = GROUPS.flatMap((g) => g.items).filter((n) => !n.href.includes('#'))
