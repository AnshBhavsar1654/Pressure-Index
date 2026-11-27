'use client'

import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { MatchScore } from '@/components/MatchScore'
import { WinWorm } from '@/components/charts/WinWorm'
import { Zoomable } from '@/components/charts/Zoom'
import { Pick, Segmented } from '@/components/filters'
import { signed } from '@/components/kit'
import { Input } from '@/components/ui/input'
import { fmt } from '@/lib/format'
import type { MatchDetail, MatchIndexRow } from '@/lib/types'
import { cn } from '@/lib/utils'

type Sort = 'date' | 'drama' | 'stakes'
const PAGE = 40

const compGroup = (c: string) => (c.startsWith('IPL') ? 'IPL' : c.includes('World Cup') ? 'T20 World Cup' : 'T20 internationals')

export function MatchExplorer({ matches }: { matches: MatchIndexRow[] }) {
  const router = useRouter()
  const params = useSearchParams()
  const idParam = Number(params.get('id')) || null
  const [q, setQ] = useState('')
  const dq = useDeferredValue(q)
  const [comp, setComp] = useState('all')
  const [season, setSeason] = useState('all')
  const [sort, setSort] = useState<Sort>('drama')
  const [ko, setKo] = useState<'all' | 'ko'>('all')
  const [shown, setShown] = useState(PAGE)
  const seasons = useMemo(() => [...new Set(matches.map((m) => m.date.slice(0, 4)))].sort().reverse(), [matches])

  const rows = useMemo(() => {
    const t = dq.trim().toLowerCase()
    return matches
      .filter((m) => (comp === 'all' || compGroup(m.comp) === comp) && (season === 'all' || m.date.startsWith(season)) && (ko === 'all' || m.knockout))
      .filter((m) => !t || m.teams.some((x) => x.toLowerCase().includes(t)) || m.comp.toLowerCase().includes(t))
      .toSorted((a, b) => (sort === 'date' ? b.date.localeCompare(a.date) : sort === 'drama' ? b.drama - a.drama : b.max_li - a.max_li))
  }, [matches, dq, comp, season, sort, ko])

  const id = idParam ?? rows[0]?.id ?? null
  const [detail, setDetail] = useState<MatchDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (id == null) return
    let live = true
    /* eslint-disable react-hooks/set-state-in-effect */
    setErr(null)
    fetch(`/matches/${id}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: MatchDetail) => live && setDetail(d))
      .catch((e: Error) => live && setErr(e.message))
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      live = false
    }
  }, [id])
  const select = (mid: number) => router.replace(`/matches/?id=${mid}`, { scroll: false })

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <section className="panel flex min-w-0 flex-col" aria-label="Matches">
        <div className="flex flex-col gap-2 border-b border-line p-3">
          <label className="relative block">
            <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <Input value={q} onChange={(e) => (setQ(e.target.value), setShown(PAGE))} placeholder="Search a team or competition" className="h-10 rounded-lg pl-9" aria-label="Search matches" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Pick label="Competition" value={comp} onChange={(v) => (setComp(v), setShown(PAGE))} options={['IPL', 'T20 World Cup', 'T20 internationals']} allLabel="All competitions" className="min-w-0 flex-1" />
            <Pick label="Season" value={season} onChange={(v) => (setSeason(v), setShown(PAGE))} options={seasons} allLabel="All seasons" className="min-w-28" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label="Sort matches"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'drama', label: 'Most dramatic' },
                { value: 'stakes', label: 'Highest stakes' },
                { value: 'date', label: 'Latest' },
              ]}
            />
            <Segmented label="Knockouts" value={ko} onChange={setKo} options={[{ value: 'all', label: 'All' }, { value: 'ko', label: 'Knockouts' }]} />
          </div>
          <span className="text-[12px] text-ink-3">{fmt.int(rows.length)} matches. Drama = total win-probability movement through the match.</span>
        </div>
        <ol className="flex max-h-[70dvh] flex-col overflow-y-auto">
          {rows.slice(0, shown).map((m) => (
            <li key={m.id}>
              <button
                onClick={() => select(m.id)}
                aria-current={m.id === id ? 'true' : undefined}
                className={cn('flex w-full flex-col gap-0.5 border-b border-line px-4 py-2.5 text-left transition-colors', m.id === id ? 'bg-panel-2' : 'hover:bg-panel-2')}
              >
                <span className="flex items-center justify-between gap-2 text-[13.5px] font-medium">
                  <span className="truncate">
                    {m.teams[0]} v {m.teams[1]}
                  </span>
                  <span className="num shrink-0 text-[12px] text-ink-3">{m.score}</span>
                </span>
                <span className="flex items-center justify-between gap-2 text-[12px] text-ink-3">
                  <span className="truncate">
                    {m.comp}
                    {m.stage !== 'League' ? ` · ${m.stage}` : ''} · {fmt.date(m.date)}
                  </span>
                  <span className="num shrink-0 text-signal-ink">{m.drama.toFixed(1)}</span>
                </span>
              </button>
            </li>
          ))}
          {shown < rows.length && (
            <li className="p-3">
              <button onClick={() => setShown((n) => n + PAGE)} className="w-full rounded-lg border border-line py-2 text-[13px] font-semibold text-signal-ink hover:bg-panel-2">
                Show more
              </button>
            </li>
          )}
          {rows.length === 0 && <li className="p-6 text-center text-[13.5px] text-ink-3">No match fits these filters. Clear the search or pick another season.</li>}
        </ol>
      </section>

      <section className="min-w-0" aria-live="polite">
        {err && (
          <div className="panel p-6 text-[14px]">
            Could not load this match ({err}).{' '}
            <button className="font-semibold text-signal-ink hover:underline" onClick={() => id && select(id)}>
              Retry
            </button>
          </div>
        )}
        {!err && !detail && <div className="panel h-[520px] animate-pulse" aria-label="Loading match" />}
        {!err && detail && <Detail d={detail} />}
      </section>
    </div>
  )
}

function Detail({ d }: { d: MatchDetail }) {
  const worm = d.balls.map((b, i) => [i, b[2], b[4], b[0]] as [number, number, number, number])
  const [i1, i2] = d.innings
  return (
    <div className="flex flex-col gap-4">
      <div className="panel min-w-0 overflow-hidden">
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <h2 className="text-base font-semibold">Match scorecard</h2>
        </div>
        <MatchScore match={d} showDate className="px-4 py-4 sm:px-5" />
        <div className="border-t border-line bg-panel-2/50 px-3 py-3 sm:px-5">
          <Zoomable label="match win probability" heading={<h3 className="text-base font-semibold">Win probability</h3>}>
            <WinWorm key={d.id} worm={worm} teams={d.teams} />
          </Zoomable>
          <p className="mt-2 text-xs text-ink-3">
            Both teams’ chances are shown before each delivery. The strip marks the {i1.pressure + (i2?.pressure ?? 0)} pressure deliveries
            {d.knockout ? ' in this knockout match.' : ' ranked in the top 20% by stakes.'}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h3 className="mb-2 text-[15px] font-semibold">Biggest swings</h3>
          <ol className="flex flex-col">
            {d.swings.map((s, i) => (
              <li key={i} className="flex items-center justify-between gap-3 border-b border-line py-2 text-[13.5px] last:border-0">
                <span className="min-w-0">
                  <span className="num mr-2 text-ink-3">{s.over}</span>
                  {s.striker} <span className="text-ink-3">v</span> {s.bowler}
                  <span className="ml-2 rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{s.outcome === 'W' ? 'wicket' : s.outcome}</span>
                </span>
                <span className="num shrink-0 font-semibold">
                  {s.wpa >= 0 ? '+' : '−'}
                  {Math.abs(s.wpa * 100).toFixed(0)} pts <span className="font-normal text-ink-3">{s.bat_team.split(' ').at(-1)}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="panel p-5">
          <h3 className="mb-2 text-[15px] font-semibold">Runs added against an average player</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {(['batting', 'bowling'] as const).map((k) => (
              <div key={k}>
                <span className="eyebrow">{k === 'batting' ? 'Batting' : 'Bowling (runs saved)'}</span>
                <ul className="mt-1.5 flex flex-col">
                  {d[k].slice(0, 5).map((p) => (
                    <li key={p.name} className="flex items-center justify-between gap-2 border-b border-line py-1.5 text-[13px] last:border-0">
                      <span className="truncate">{p.name}</span>
                      <span className="num shrink-0">
                        <span className="text-ink-3">{'w' in p ? `${p.w}/${p.r}` : `${p.r} (${p.b})`}</span> <b className={p.rv >= 0 ? 'text-signal-ink' : 'text-data-ink'}>{signed(p.rv)}</b>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-ink-3">
            Context-adjusted: each ball against what an average player gets from the same score, balls left and wickets.{' '}
            <Link href="/method/#measure" className="font-semibold text-signal-ink hover:underline">
              How
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
