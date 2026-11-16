import { Moon, Sun } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { rescore, useAppData, type Role, type Weights } from './lib/data'
import { Leaderboard } from './views/Leaderboard'
import { Methodology } from './views/Methodology'
import { Overview } from './views/Overview'
import { PressureModel } from './views/PressureModel'
import { Profile } from './views/Profile'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'pressure', label: 'Pressure model' },
  { id: 'batters', label: 'Batters' },
  { id: 'bowlers', label: 'Bowlers' },
  { id: 'player', label: 'Player profile' },
  { id: 'method', label: 'Methodology' },
] as const
type Tab = (typeof TABS)[number]['id']

function readHash(): Tab {
  const h = window.location.hash.replace('#', '').split('/')[0]
  return (TABS.find((t) => t.id === h)?.id ?? 'overview') as Tab
}

export default function App() {
  const { data, error } = useAppData()
  const [tab, setTab] = useState<Tab>(readHash)
  const [wBat, setWBat] = useState<Weights | null>(null)
  const [wBowl, setWBowl] = useState<Weights | null>(null)
  const [profileRole, setProfileRole] = useState<Role>('bat')
  const [profileId, setProfileId] = useState<number | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark' | null>(() => {
    try {
      return (localStorage.getItem('theme') as 'light' | 'dark' | null) ?? null
    } catch {
      return null
    }
  })

  useEffect(() => {
    const onHash = () => setTab(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme
    try {
      if (theme) localStorage.setItem('theme', theme)
    } catch {
      /* storage unavailable */
    }
  }, [theme])

  const go = (t: string) => {
    window.location.hash = t
    window.scrollTo({ top: 0 })
  }
  const defaults = data?.summary.weights
  const bat = useMemo(() => (data ? rescore(data.bat.players, wBat ?? data.summary.weights) : []), [data, wBat])
  const bowl = useMemo(() => (data ? rescore(data.bowl.players, wBowl ?? data.summary.weights) : []), [data, wBowl])

  const openPlayer = (role: Role, id: number) => {
    setProfileRole(role)
    setProfileId(id)
    go('player')
  }

  const isDark =
    theme === 'dark' || (theme === null && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-navy text-navy-ink">
        <div className="mx-auto flex max-w-[1240px] items-center gap-4 px-4 py-3 sm:px-6">
          <a href="#overview" className="flex items-center gap-2.5" aria-label="Pressure Index home">
            <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
              <rect width="32" height="32" rx="4" fill="#e5338f" />
              <path d="M6 24 L12 16 L17 19 L26 8" fill="none" stroke="#0f1a3d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="display text-[1.35rem] font-bold uppercase tracking-wide">Pressure Index</span>
          </a>
          <span className="hidden text-[12px] text-navy-ink/60 md:inline">for Rajasthan Royals · IPL 2027 auction</span>
          <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="ml-auto rounded-[3px] p-1.5 text-navy-ink/80 hover:bg-white/10 hover:text-navy-ink"
            aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {isDark ? <Sun size={18} weight="bold" /> : <Moon size={18} weight="bold" />}
          </button>
        </div>
        <nav className="mx-auto max-w-[1240px] overflow-x-auto px-2 sm:px-4" aria-label="Sections">
          <ul className="flex min-w-max">
            {TABS.map((t) => (
              <li key={t.id}>
                <a
                  href={`#${t.id}`}
                  aria-current={tab === t.id ? 'page' : undefined}
                  className={`block border-b-[3px] px-3 py-2.5 text-[13.5px] font-semibold ${
                    tab === t.id ? 'border-[#e5338f] text-navy-ink' : 'border-transparent text-navy-ink/65 hover:text-navy-ink'
                  }`}
                >
                  {t.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">
        {error && (
          <div className="panel p-6 text-ink-2">
            Could not load the rating data: {error}. Run <code>python -I analysis/pipeline.py</code> to regenerate it.
          </div>
        )}
        {!data && !error && <Skeleton />}
        {data && defaults && (
          <>
            {tab === 'overview' && <Overview data={data} bat={bat} bowl={bowl} openPlayer={openPlayer} go={go} />}
            {tab === 'pressure' && <PressureModel data={data} />}
            {tab === 'batters' && (
              <Leaderboard role="bat" roleData={data.bat} players={bat} weights={wBat ?? defaults} defaults={defaults} setWeights={setWBat} openPlayer={openPlayer} />
            )}
            {tab === 'bowlers' && (
              <Leaderboard role="bowl" roleData={data.bowl} players={bowl} weights={wBowl ?? defaults} defaults={defaults} setWeights={setWBowl} openPlayer={openPlayer} />
            )}
            {tab === 'player' && (
              <Profile
                role={profileRole}
                setRole={(r) => {
                  setProfileRole(r)
                  setProfileId(null)
                }}
                players={profileRole === 'bat' ? bat : bowl}
                playerId={profileId}
                setPlayerId={setProfileId}
              />
            )}
            {tab === 'method' && <Methodology data={data} bat={bat} bowl={bowl} />}
          </>
        )}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-1 px-4 py-6 text-[12px] text-ink-3 sm:flex-row sm:justify-between sm:px-6">
          <span>
            Data: SupeRR Selector Season 2 data pack (IPL and T20I ball-by-ball, 2022 to 2026). Independent hackathon entry.
          </span>
          <a href="#method" className="hover:text-ink">
            Methodology and limitations
          </a>
        </div>
      </footer>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="h-10 w-2/3 rounded-[3px] bg-surface-2" />
      <div className="h-4 w-1/2 rounded-[3px] bg-surface-2" />
      <div className="grid gap-5 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="panel flex flex-col gap-3 p-5">
            {Array.from({ length: 10 }, (_, j) => (
              <div key={j} className="h-7 rounded-[3px] bg-surface-2" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
