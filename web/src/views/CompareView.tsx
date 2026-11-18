'use client'

import { MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ChartFrame, Legend } from '@/components/charts/core'
import { LineChart } from '@/components/charts/LineChart'
import { Flag } from '@/components/Flag'
import { BallIcon, BatIcon } from '@/components/icons'
import { PlayerAvatar, RetainedMark } from '@/components/kit'
import { TeamBadge } from '@/components/TeamBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fmt } from '@/lib/format'
import { betterThan, excludedLong, term, winPts } from '@/lib/terms'
import { COMPONENT_LABEL, rescore, type ComponentKey, type Player, type Role } from '@/lib/types'
import { cn } from '@/lib/utils'

const MAX = 3
const COLORS = ['var(--pink)', 'var(--blue)', 'var(--gold)']
const KEYS = Object.keys(COMPONENT_LABEL) as ComponentKey[]

type Row = {
  label: string
  hint?: string
  get: (p: Player) => number | null | undefined
  fmt: (v: number | null | undefined) => string
  /** which value wins: 1 = higher, -1 = lower, 0 = no winner (volume figures) */
  better: 1 | -1 | 0
}

const pctTxt = (v: number | null | undefined) => (v == null ? '–' : `${fmt.dec(v)}%`)

function rowsFor(role: Role): Row[] {
  const bat = role === 'bat'
  const d = (n: number) => (v: number | null | undefined) => fmt.dec(v, n)
  return [
    { label: `Pressure rating (${bat ? 'runs added' : 'runs saved'} per 100)`, hint: term('underPressure', role).def, get: (p) => p.p_rv100, fmt: (v) => fmt.signed(v), better: 1 },
    { label: 'Recent form (2025–26)', hint: term('recentForm').def, get: (p) => p.recent100, fmt: (v) => fmt.signed(v), better: 1 },
    { label: `Usual level (${bat ? 'runs added' : 'runs saved'} per 100)`, hint: term('normal').def, get: (p) => p.n_rv100, fmt: (v) => fmt.signed(v), better: 1 },
    { label: 'Lift under pressure', hint: term('lift').def, get: (p) => p.delta100, fmt: (v) => fmt.signed(v), better: 1 },
    { label: 'Win impact', hint: term('winImpact').def, get: (p) => p.wpa100, fmt: winPts, better: 1 },
    { label: 'Consistency', hint: term('consistency', role).def, get: (p) => p.cons, fmt: (v) => fmt.pct(v), better: 1 },
    bat
      ? { label: 'Strike rate (pressure)', get: (p) => p.press.sr, fmt: d(0), better: 1 }
      : { label: 'Economy (pressure)', get: (p) => p.press.econ, fmt: d(2), better: -1 },
    bat
      ? { label: 'Strike rate (normal)', get: (p) => p.norm.sr, fmt: d(0), better: 1 }
      : { label: 'Economy (normal)', get: (p) => p.norm.econ, fmt: d(2), better: -1 },
    bat
      ? { label: 'Runs per dismissal (pressure)', get: (p) => p.press.avg, fmt: d(1), better: 1 }
      : { label: 'Balls per wicket (pressure)', get: (p) => p.press.sr, fmt: d(1), better: -1 },
    { label: 'Dot balls (pressure)', get: (p) => p.press.dot_pct, fmt: pctTxt, better: bat ? -1 : 1 },
    { label: bat ? 'Boundary balls (pressure)' : 'Boundaries conceded (pressure)', get: (p) => p.press.bnd_pct, fmt: pctTxt, better: bat ? 1 : -1 },
    { label: 'Pressure balls', hint: 'How much evidence sits behind the numbers', get: (p) => p.p_balls, fmt: (v) => (v == null ? '–' : fmt.int(v)), better: 0 },
    { label: 'Matches with pressure', get: (p) => p.p_matches, fmt: (v) => (v == null ? '–' : String(v)), better: 0 },
  ]
}

export function CompareView({ pools }: { pools: Record<Role, Player[]> }) {
  const [role, setRole] = useState<Role>('bat')
  const [ids, setIds] = useState<number[]>([])
  const [q, setQ] = useState('')

  // links from player pages arrive as /compare/?role=bat&ids=1,2
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const r: Role = sp.get('role') === 'bowl' ? 'bowl' : 'bat'
    const want = (sp.get('ids') ?? '').split(',').map(Number).filter(Boolean)
    // the static page cannot know the query string at build time, so it is read once after load
    /* eslint-disable react-hooks/set-state-in-effect */
    setRole(r)
    setIds(want.filter((id) => pools[r].some((p) => p.id === id)).slice(0, MAX))
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [pools])

  const pool = pools[role]
  const chosen = useMemo(() => ids.map((id) => pool.find((p) => p.id === id)).filter((p): p is Player => !!p), [ids, pool])
  const qualified = useMemo(() => pool.filter((p) => p.merit_rank != null), [pool])
  // evidence as z-scores against the qualified pool, adding the player if outside it
  const zs = useMemo(
    () => Object.fromEntries(chosen.map((p) => [p.id, rescore(p.merit_rank != null ? qualified : [...qualified, p]).find((x) => x.id === p.id)!])),
    [chosen, qualified],
  )

  const suggestions = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return []
    return pool
      .filter((p) => !ids.includes(p.id) && p.name.toLowerCase().includes(term))
      .toSorted((a, b) => b.p_balls - a.p_balls)
      .slice(0, 8)
  }, [q, pool, ids])

  const sync = (r: Role, next: number[]) => {
    window.history.replaceState(null, '', next.length ? `/compare/?role=${r}&ids=${next.join(',')}` : '/compare/')
  }
  const add = (id: number) => {
    const next = [...ids, id].slice(0, MAX)
    setIds(next)
    setQ('')
    sync(role, next)
  }
  const remove = (id: number) => {
    const next = ids.filter((x) => x !== id)
    setIds(next)
    sync(role, next)
  }
  const switchRole = (r: Role) => {
    setRole(r)
    setIds([])
    setQ('')
    sync(r, [])
  }

  const noun = role === 'bat' ? 'batter' : 'bowler'
  const rows = rowsFor(role)
  const seasons = [...new Set(chosen.flatMap((p) => p.seasons.map((s) => s.season)))].sort()
  const series = chosen.map((p, i) => ({
    key: String(p.id),
    label: p.name,
    color: COLORS[i],
    points: p.seasons.filter((s) => s.p_balls >= 1 && s.p_rv100 != null).map((s) => ({ x: s.season, y: s.p_rv100, n: s.p_balls })),
  }))
  const hasSeasonLine = series.some((s) => s.points.length > 0)

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Choose who to compare</CardTitle>
          <CardDescription>Every player with a profile is available, including those outside my ranking.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex gap-1 rounded-lg border border-line bg-panel-2/70 p-1" role="group" aria-label="Role">
              {(['bat', 'bowl'] as Role[]).map((r) => (
                <button
                  key={r}
                  onClick={() => r !== role && switchRole(r)}
                  aria-pressed={role === r}
                  className={cn('flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px]', role === r ? 'bg-pink text-white' : 'text-ink-2 hover:text-foreground')}
                >
                  {r === 'bat' ? <BatIcon size={16} /> : <BallIcon size={16} />}
                  {r === 'bat' ? 'Batters' : 'Bowlers'}
                </button>
              ))}
            </span>
            <div className="relative">
              <label className="relative block">
                <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  disabled={ids.length >= MAX}
                  placeholder={ids.length >= MAX ? `Up to ${MAX} ${noun}s` : `Search ${noun}s by name`}
                  className="h-10 w-72 rounded-lg pl-9"
                  aria-label={`Search ${noun}s to compare`}
                />
              </label>
              {suggestions.length > 0 && (
                <ul className="absolute left-0 top-11 z-20 w-80 overflow-hidden rounded-lg border border-line bg-panel shadow-lg">
                  {suggestions.map((p) => (
                    <li key={p.id}>
                      <button onClick={() => add(p.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-panel-2">
                        <PlayerAvatar name={p.name} rr={p.ipl_team === 'Rajasthan Royals'} size={28} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium">{p.name}</span>
                          <span className="block text-[12px] text-ink-3">
                            {p.p_balls} pressure balls{p.rank != null ? `, rank ${p.rank}` : ''}
                          </span>
                        </span>
                        <Flag country={p.country} size={20} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {chosen.length > 0 && (
              <Button variant="ghost" className="rounded-lg" onClick={() => (setIds([]), sync(role, []))}>
                Clear all
              </Button>
            )}
          </div>
          {chosen.length < 2 && <p className="text-[13.5px] text-ink-3">Search for a name{chosen.length === 1 ? ' and add at least one more player' : ''} to see the comparison.</p>}
        </CardContent>
      </Card>

      {chosen.length > 0 && (
        <div className={cn('grid gap-4', chosen.length === 1 ? 'md:grid-cols-1' : chosen.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3')}>
          {chosen.map((p, i) => (
            <section key={p.id} className="panel relative flex flex-col gap-3 p-5" style={{ borderTop: `4px solid ${COLORS[i]}` }}>
              <button onClick={() => remove(p.id)} className="absolute right-3 top-3 rounded-md p-1.5 text-ink-3 hover:bg-panel-2 hover:text-foreground" aria-label={`Remove ${p.name}`}>
                <XIcon size={16} />
              </button>
              <div className="flex items-center gap-3 pr-7">
                <PlayerAvatar name={p.name} rr={p.ipl_team === 'Rajasthan Royals'} size={48} />
                <div className="min-w-0">
                  <h2 className="display flex items-center gap-2 text-[1.6rem]">
                    <span className="truncate">{p.name}</span>
                    {p.retained_by && <RetainedMark team={p.retained_by} size={20} />}
                  </h2>
                  <span className="text-[12.5px] text-ink-3">{role === 'bat' ? p.hand : p.bowl_type}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Flag country={p.country} size={22} />
                <TeamBadge team={p.ipl_team} size={24} />
                <span className="text-[12.5px] text-ink-2">{p.country}</span>
              </div>
              <div className="flex items-end justify-between">
                <span>
                  <span className="block text-[12.5px] text-ink-3">My rank</span>
                  <span className="display num text-[2rem] text-pink">{p.rank ?? '–'}</span>
                </span>
                <Button asChild variant="outline" size="sm" className="rounded-md">
                  <Link href={`/players/${role}/${p.id}/`}>Full profile</Link>
                </Button>
              </div>
              {p.rank == null && (
                <p className="text-[12px] leading-snug text-ink-3">
                  {p.excluded ? excludedLong(p) : 'Not enough pressure balls to be ranked, so these figures rest on a small sample.'}
                </p>
              )}
            </section>
          ))}
        </div>
      )}

      {chosen.length >= 2 && (
        <>
          <Card className="gap-0 pb-0">
            <CardHeader className="border-b pb-4">
              <CardTitle>Side by side</CardTitle>
              <CardDescription>The best figure in each row is marked in pink. Volume rows have no winner.</CardDescription>
            </CardHeader>
            <Table className="min-w-[560px] text-[14px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5" />
                  {chosen.map((p, i) => (
                    <TableHead key={p.id} className={cn('text-right text-ink-3', i === chosen.length - 1 && 'pr-5')}>
                      <span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: COLORS[i] }} />
                      {p.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const vals = chosen.map((p) => r.get(p))
                  const nums = vals.filter((v): v is number => v != null)
                  const best = r.better && nums.length > 1 ? (r.better === 1 ? Math.max(...nums) : Math.min(...nums)) : null
                  return (
                    <TableRow key={r.label}>
                      <TableCell className="py-2.5 pl-5 text-ink-2" title={r.hint}>
                        {r.label}
                      </TableCell>
                      {vals.map((v, i) => (
                        <TableCell key={chosen[i].id} className={cn('num text-right', i === vals.length - 1 && 'pr-5', best != null && v === best ? 'font-semibold text-pink-ink' : 'text-ink')}>
                          {r.fmt(v)}
                        </TableCell>
                      ))}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>The evidence, side by side</CardTitle>
              <CardDescription>
                The pressure rating decides the rank; the rest show whether it holds up. The number is the share of qualified {noun}s each player beats; right of centre is above average.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <Legend items={chosen.map((p, i) => ({ label: p.name, color: COLORS[i] }))} />
              <div className="grid gap-5 md:grid-cols-2">
                {KEYS.map((k) => (
                  <div key={k} className="flex flex-col gap-2">
                    <span className="text-[13.5px] font-semibold">{COMPONENT_LABEL[k]}</span>
                    {chosen.map((p, i) => {
                      const z = zs[p.id]?.z[k] ?? 0
                      const beats = zs[p.id]?.beats[k] ?? betterThan(z)
                      const w = Math.min(50, (Math.abs(z) / 3) * 50)
                      return (
                        <div key={p.id} className="flex items-center gap-3">
                          <span className="relative h-3 flex-1 rounded-full bg-panel-2">
                            <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
                            <span className="absolute inset-y-0 rounded-full" style={{ background: COLORS[i], width: `${w}%`, left: z >= 0 ? '50%' : `${50 - w}%` }} />
                          </span>
                          <span className="num w-10 text-right text-[12.5px] text-ink-2">{beats}%</span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {hasSeasonLine && (
            <ChartFrame
              title="Season by season under pressure"
              subtitle={`${role === 'bat' ? 'Runs added' : 'Runs saved'} per 100 pressure balls. Every season with a pressure ball is shown; a season with only a few balls is a thin sample.`}
              legend={<Legend items={series.map((s) => ({ label: s.label, color: s.color, shape: 'line' }))} />}
            >
              <LineChart series={series} xTicks={seasons} zeroLine showPoints yFormat={(v) => fmt.signed(v, 0)} height={280} />
            </ChartFrame>
          )}

          <Card className="gap-0 pb-0">
            <CardHeader className="border-b pb-4">
              <CardTitle>By phase of the innings</CardTitle>
              <CardDescription>{role === 'bat' ? 'Runs added' : 'Runs saved'} per 100 pressure balls in each phase, with the balls behind it.</CardDescription>
            </CardHeader>
            <Table className="min-w-[560px] text-[14px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5" />
                  {chosen.map((p, i) => (
                    <TableHead key={p.id} className={cn('text-right text-ink-3', i === chosen.length - 1 && 'pr-5')}>
                      {p.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {['Powerplay', 'Middle', 'Death'].map((ph) => {
                  const cells = chosen.map((p) => p.phases.find((x) => x.phase === ph))
                  const nums = cells.map((c) => c?.rv100).filter((v): v is number => v != null)
                  const best = nums.length > 1 ? Math.max(...nums) : null
                  return (
                    <TableRow key={ph}>
                      <TableCell className="py-2.5 pl-5 text-ink-2">{ph === 'Middle' ? 'Middle overs' : ph}</TableCell>
                      {cells.map((c, i) => (
                        <TableCell key={chosen[i].id} className={cn('num text-right', i === cells.length - 1 && 'pr-5', best != null && c?.rv100 === best && 'font-semibold text-pink-ink')}>
                          {fmt.signed(c?.rv100)}
                          <span className="text-[12px] text-ink-3"> · {c?.balls ?? 0} balls</span>
                        </TableCell>
                      ))}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  )
}
