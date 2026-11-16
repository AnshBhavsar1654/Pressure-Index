'use client'

import {
  BookOpenText,
  ChartLineUp,
  Crown,
  Gauge,
  House,
  Moon,
  Sun,
  Target,
  type Icon,
} from '@phosphor-icons/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

type Item = { href: string; label: string; icon: Icon }
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'The question',
    items: [
      { href: '/', label: 'Overview', icon: House },
      { href: '/pressure/', label: 'How pressure works', icon: Gauge },
    ],
  },
  {
    title: 'Rankings',
    items: [
      { href: '/rankings/bat/', label: 'Batters', icon: ChartLineUp },
      { href: '/rankings/bowl/', label: 'Bowlers', icon: Target },
    ],
  },
  {
    title: 'Rajasthan Royals',
    items: [
      { href: '/rajasthan/', label: 'IPL 2026 review', icon: Crown },
      { href: '/auction/', label: 'Auction targets', icon: Target },
    ],
  },
  {
    title: 'About',
    items: [{ href: '/method/', label: 'Method in plain words', icon: BookOpenText }],
  },
]

function Mark() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="7" fill="var(--pink)" />
      <path d="M5 21 C9 21 10 12 14 12 S18 24 22 18 S25 9 27 8" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

export function Sidebar() {
  const path = usePathname()
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const t = document.documentElement.dataset.theme
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches)
  }, [])

  const toggle = () => {
    const next = dark ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('theme', next)
    } catch {
      /* storage unavailable: theme still applies for this visit */
    }
    setDark(!dark)
  }

  const isActive = (href: string) => (href === '/' ? path === '/' : path.startsWith(href.replace(/\/$/, '')))
  const isPlayer = path.startsWith('/players/')

  return (
    <aside className="sticky top-0 z-30 bg-rail text-rail-ink lg:h-dvh lg:overflow-y-auto">
      <div className="flex items-center gap-3 px-4 py-3.5 lg:px-5 lg:pb-6 lg:pt-6">
        <Mark />
        <div className="leading-tight">
          <div className="display text-[1.55rem] uppercase">Pressure Index</div>
          <div className="text-[12px] text-rail-dim">For Rajasthan Royals, IPL 2027</div>
        </div>
        <button
          onClick={toggle}
          className="ml-auto grid h-10 w-10 place-items-center rounded-lg text-rail-dim hover:bg-rail-2 hover:text-rail-ink lg:hidden"
          aria-label={dark ? 'Use light theme' : 'Use dark theme'}
        >
          {dark ? <Sun size={19} weight="bold" /> : <Moon size={19} weight="bold" />}
        </button>
      </div>

      <nav aria-label="Sections" className="overflow-x-auto px-2 pb-2 lg:overflow-visible lg:px-3 lg:pb-0">
        <ul className="flex gap-1 lg:flex-col lg:gap-5">
          {GROUPS.map((g) => (
            <li key={g.title} className="contents lg:block">
              <div className="hidden px-3 pb-1.5 text-[12px] font-medium text-rail-dim lg:block">{g.title}</div>
              <ul className="contents lg:flex lg:flex-col lg:gap-0.5">
                {g.items.map((it) => {
                  const active = isActive(it.href) || (isPlayer && it.href.startsWith('/rankings') && path.includes(it.href.split('/')[2]))
                  const I = it.icon
                  return (
                    <li key={it.href} className="shrink-0">
                      <Link
                        href={it.href}
                        aria-current={active ? 'page' : undefined}
                        className={`relative flex min-h-10 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 text-[14px] font-medium transition-colors ${
                          active ? 'bg-rail-2 text-rail-ink' : 'text-rail-dim hover:bg-rail-2/60 hover:text-rail-ink'
                        }`}
                      >
                        {active && <span className="absolute inset-y-2 left-0 hidden w-[3px] rounded-full bg-pink lg:block" />}
                        <I size={18} weight={active ? 'fill' : 'regular'} className={active ? 'text-pink' : ''} />
                        {it.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-8 hidden border-t border-white/10 px-5 py-5 lg:block">
        <button
          onClick={toggle}
          className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-[14px] text-rail-dim hover:bg-rail-2 hover:text-rail-ink"
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
          {dark ? 'Light theme' : 'Dark theme'}
        </button>
        <p className="mt-4 px-3 text-[12px] leading-relaxed text-rail-dim">
          SupeRR Selector Season 2, Round 1. Built only from the supplied IPL and T20I ball-by-ball data, 2022 to 2026.
        </p>
      </div>
    </aside>
  )
}
