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
      { href: '/similar/', label: 'Similar players', icon: ChartScatterIcon },
    ],
  },
]

/** Pressure Index win-probability mark. */
export function Mark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="4" fill="#efda79" />
      <path d="M5 19 L10 18 L13 20 L16.5 8 L19 24 L21.5 15 L27 14" fill="none" stroke="#22211c" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function activeLink(path: string, href: string) {
  const route = path.replace(/\/$/, '')
  const section = href.replace(/\/$/, '')
  if (route === section) return true
  if (href.startsWith('/rankings/')) return route.startsWith(`/players/${href.split('/')[2]}/`)
  return href !== '/' && href !== '/players/' && route.startsWith(href)
}

export function sectionLabel(path: string) {
  return GROUPS.flatMap((group) => group.items).find(({ href }) => activeLink(path, href))?.label
}

export function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname()
  return (
      <nav aria-label="Dashboard sections" className="flex flex-col gap-6">
        {GROUPS.map((g) => (
          <div key={g.title} className="flex flex-col gap-0.5">
            <span className="px-3 pb-1 text-xs font-medium text-rail-dim">{g.title}</span>
            {g.items.map((it) => {
              const on = activeLink(path, it.href)
              const I = it.icon
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={onNavigate}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'relative flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors lg:min-h-9',
                    on ? 'bg-panel-2 text-rail-ink' : 'text-rail-dim hover:bg-panel-2 hover:text-rail-ink',
                  )}
                >
                  {on && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-sm bg-signal" />}
                  <I size={18} weight="regular" />
                  {it.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
  )
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r border-line bg-rail lg:flex">
      <Link href="/" className="flex min-h-16 items-center gap-3 border-b border-line px-6 text-lg font-semibold" aria-label="Pressure Index home">
        <Mark size={32} />
        <span>Pressure Index</span>
      </Link>
      <div className="p-4"><Navigation /></div>
    </aside>
  )
}
