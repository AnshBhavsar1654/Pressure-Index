'use client'

import { BookOpenTextIcon, ChartLineUpIcon, CrownIcon, GaugeIcon, HouseIcon, ShoppingBagIcon, TargetIcon, type Icon } from '@phosphor-icons/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

type Item = { href: string; label: string; icon: Icon }
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Pressure',
    items: [
      { href: '/', label: 'Overview', icon: HouseIcon },
      { href: '/pressure/', label: 'What is pressure', icon: GaugeIcon },
    ],
  },
  {
    title: 'Rankings',
    items: [
      { href: '/rankings/bat/', label: 'Batters', icon: ChartLineUpIcon },
      { href: '/rankings/bowl/', label: 'Bowlers', icon: TargetIcon },
    ],
  },
  {
    title: 'Rajasthan Royals',
    items: [
      { href: '/rajasthan/', label: 'IPL 2026 review', icon: CrownIcon },
      { href: '/auction/', label: 'Auction targets', icon: ShoppingBagIcon },
    ],
  },
  {
    title: 'About',
    items: [{ href: '/method/', label: 'Methodology', icon: BookOpenTextIcon }],
  },
]

export function Mark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="7" fill="#d81f7c" />
      <path d="M5 21 C9 21 10 12 14 12 S18 24 22 18 S25 9 27 8" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

export function Sidebar() {
  const path = usePathname()
  const active = (href: string) => {
    if (href === '/') return path === '/'
    if (href.startsWith('/rankings/')) {
      const role = href.split('/')[2]
      return path.startsWith(href) || path.startsWith(`/players/${role}/`)
    }
    return path.startsWith(href)
  }

  return (
    <aside className="panel sticky top-5 hidden h-[calc(100dvh-2.5rem)] w-[236px] shrink-0 flex-col overflow-y-auto bg-rail! p-4 lg:flex">
      <Link href="/" className="flex items-center gap-3 px-1 pb-6 pt-1" aria-label="Pressure Index home">
        <Mark />
        <span className="leading-none">
          <span className="display block text-[1.5rem] uppercase">Pressure Index</span>
          <span className="mt-1 block text-[12px] text-rail-dim">Rajasthan Royals, IPL 2027</span>
        </span>
      </Link>
      <nav aria-label="Sections" className="flex flex-col gap-5">
        {GROUPS.map((g) => (
          <div key={g.title} className="flex flex-col gap-1">
            <span className="px-3 pb-1 text-[12px] font-medium text-rail-dim">{g.title}</span>
            {g.items.map((it) => {
              const on = active(it.href)
              const I = it.icon
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center gap-3 rounded-lg px-3 text-[14.5px] font-medium transition-colors',
                    on
                      ? 'bg-pink text-white'
                      : 'text-rail-dim hover:bg-panel-2 hover:text-rail-ink',
                  )}
                >
                  <I size={19} weight={on ? 'fill' : 'regular'} />
                  {it.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}

export const NAV = GROUPS.flatMap((g) => g.items)
