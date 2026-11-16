'use client'

import { ArrowCounterClockwiseIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import { useDeferredValue, useMemo, useState } from 'react'
import { ChartFrame, Legend } from '@/components/charts/core'
import { NAT_OPTIONS, natMatch, Pick, Segmented, type Nat } from '@/components/filters'
import { PressureScatter } from '@/components/charts/Scatter'
import { Meter, PlayerAvatar } from '@/components/kit'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Flag } from '@/components/Flag'
import { TeamBadge } from '@/components/TeamBadge'
import { fmt } from '@/lib/format'
import { COMPONENT_HINT, COMPONENT_LABEL, rescore, type ComponentKey, type Player, type Role, type ScoredPlayer, type Weights } from '@/lib/types'
import { cn } from '@/lib/utils'

type SortKey = 'liveRank' | 'p_rv100' | 'n_rv100' | 'delta100' | 'wpa100' | 'cons' | 'p_balls' | 'p_top10' | 'trad'
const KEYS = Object.keys(COMPONENT_LABEL) as ComponentKey[]

export function Leaderboard({
  role,
  players: all,
  defaults,
  bar,
  total: everyone,
}: {
  role: Role
  players: Player[]
  defaults: Weights
  bar: { balls: number; matches: number; minBalls: number; minMatches: number }
  /** every player with a pressure ball, not only those the sliders can reach */
  total: number
}) {
  const router = useRouter()
  const [weights, setWeights] = useState<Weights>(defaults)
  const [minBalls, setMinBalls] = useState(bar.balls)
  const [minMatches, setMinMatches] = useState(bar.matches)
  const dBalls = useDeferredValue(minBalls)
  const dMatches = useDeferredValue(minMatches)
  // who qualifies: everyone at or above the chosen bar is rated against each other
  const raw = useMemo(() => all.filter((p) => p.p_balls >= dBalls && p.p_matches >= dMatches), [all, dBalls, dMatches])
  const barChanged = minBalls !== bar.balls || minMatches !== bar.matches
  const [q, setQ] = useState('')
  const [nat, setNat] = useState<Nat>('all')
  const [team, setTeam] = useState('all')
  const [country, setCountry] = useState('all')
  const teams = useMemo(() => [...new Set(all.map((p) => p.ipl_team).filter((t): t is string => !!t))].sort(), [all])
  const countries = useMemo(() => [...new Set(all.map((p) => p.country).filter((t): t is string => !!t))].sort(), [all])
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'liveRank', dir: 1 })
  // keep slider dragging smooth: the scatter and table re-rank from a deferred copy
  const deferred = useDeferredValue(weights)
  const players = useMemo(() => rescore(raw, deferred), [raw, deferred])
  const top10 = useMemo(() => new Set(players.slice(0, 10).map((p) => p.id)), [players])
  const noun = role === 'bat' ? 'batters' : 'bowlers'
  const open = (id: number) => router.push(`/players/${role}/${id}/`)
  const total = KEYS.reduce((a, k) => a + weights[k], 0) || 1
  const changed = KEYS.some((k) => Math.abs(weights[k] - defaults[k]) > 1e-9)

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    const val = (p: ScoredPlayer): number =>
      sort.key === 'p_top10' ? (p.boot?.p_top10 ?? -1) : sort.key === 'trad' ? ((role === 'bat' ? p.press.sr : p.press.econ) ?? 0) : (p[sort.key] as number)
    return players
      .filter((p) => !term || [p.name, p.country ?? '', p.ipl_team ?? ''].some((s) => s.toLowerCase().includes(term)))
      .filter((p) => natMatch(nat, p.country) && (team === 'all' || p.ipl_team === team) && (country === 'all' || p.country === country))
      .toSorted((a, b) => (val(a) - val(b)) * sort.dir)
  }, [players, q, sort, role, nat, team, country])

  const head = (key: SortKey, label: string, title?: string, left = false) => (
    <TableHead className={cn('h-11 text-[12.5px] font-medium text-ink-3', !left && 'text-right')} title={title} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button
        className={cn('hover:text-foreground', sort.key === key && 'text-foreground')}
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === 'liveRank' ? 1 : -1 }))}
      >
        {label}
        {sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
      </button>
    </TableHead>
  )

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Who qualifies</CardTitle>
          <CardDescription>
            The submitted ranking needs {bar.balls}+ high-pressure balls across {bar.matches}+ matches. Lower the bar to widen the
            shortlist, for example when retentions take players out of the auction. Small samples are pulled towards each
            player’s normal level, so short records cannot run away with the top spots.
          </CardDescription>
          <CardAction>
            <Button
              variant="outline"
              className="rounded-lg"
              disabled={!barChanged}
              onClick={() => {
                setMinBalls(bar.balls)
                setMinMatches(bar.matches)
              }}
            >
              <ArrowCounterClockwiseIcon data-icon="inline-start" />
              Default bar
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-center">
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-panel-2 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span id="min-balls" className="text-[14px] font-semibold">
                Minimum pressure balls
              </span>
              <span className="display num text-[1.6rem] text-pink">{minBalls}</span>
            </div>
            <Slider aria-labelledby="min-balls" min={bar.minBalls} max={300} step={10} value={[minBalls]} onValueChange={([v]) => setMinBalls(v)} />
            <span className="flex justify-between text-[12px] text-ink-3">
              <span>{bar.minBalls}</span>
              <span>300</span>
            </span>
          </div>
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-panel-2 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span id="min-matches" className="text-[14px] font-semibold">
                Minimum matches with pressure balls
              </span>
              <span className="display num text-[1.6rem] text-pink">{minMatches}</span>
            </div>
            <Slider aria-labelledby="min-matches" min={bar.minMatches} max={25} step={1} value={[minMatches]} onValueChange={([v]) => setMinMatches(v)} />
            <span className="flex justify-between text-[12px] text-ink-3">
              <span>{bar.minMatches}</span>
              <span>25</span>
            </span>
          </div>
          <div className="flex flex-col items-start gap-0.5 md:items-end md:px-2">
            <span className="display num text-[2.6rem] leading-none">{raw.length}</span>
            <span className="text-[13px] text-ink-3">
              {noun} qualify, of {everyone}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Build your own ranking</CardTitle>
          <CardDescription>The rating blends four ingredients. Change how much each one counts and watch the order move.</CardDescription>
          <CardAction>
            <Button variant="outline" className="rounded-lg" disabled={!changed} onClick={() => setWeights(defaults)}>
              <ArrowCounterClockwiseIcon data-icon="inline-start" />
              Reset to submitted
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {KEYS.map((k) => (
            <div key={k} className="flex flex-col gap-3 rounded-lg border border-line bg-panel-2/60 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span id={`w-${k}`} className="text-[14px] font-semibold">
                  {COMPONENT_LABEL[k]}
                </span>
                <span className="display num text-[1.6rem] text-pink">{Math.round((weights[k] / total) * 100)}%</span>
              </div>
              <Slider
                aria-labelledby={`w-${k}`}
                min={0}
                max={1}
                step={0.05}
                value={[weights[k]]}
                onValueChange={([v]) => setWeights((w) => ({ ...w, [k]: v }))}
              />
              <span className="text-[12.5px] leading-snug text-ink-3">{COMPONENT_HINT[k]}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <ChartFrame
        title="Normal level against pressure level"
        subtitle={`Every eligible ${role === 'bat' ? 'batter' : 'bowler'}. Right is better in ordinary moments, up is better under pressure, and above the diagonal means they rise when it matters. Dot size is pressure balls played. Click any dot to open the player.`}
        legend={
          <Legend
            items={[
              { label: 'Current top 10', color: 'var(--pink)' },
              { label: `Other ${noun}`, color: 'var(--neutral-mark)' },
            ]}
          />
        }
        footnote="Runs added per 100 balls, compared with an average player in exactly the same match situations."
      >
        <PressureScatter players={players} highlight={top10} onSelect={open} height={460} />
      </ChartFrame>

      <Card className="gap-0 pb-0">
        <CardHeader className="border-b pb-4">
          <CardTitle>
            {rows.length === players.length ? `All ${players.length} eligible ${noun}` : `${rows.length} of ${players.length} ${noun}`}
          </CardTitle>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="relative block">
              <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" className="h-10 w-56 rounded-lg pl-9" aria-label={`Search ${noun}`} />
            </label>
            <Segmented label="Nationality" value={nat} onChange={setNat} options={NAT_OPTIONS} />
            <Pick label="IPL team" value={team} onChange={setTeam} options={teams} allLabel="All IPL teams" />
            <Pick label="Country" value={country} onChange={setCountry} options={countries} allLabel="All countries" />
            {(q || nat !== 'all' || team !== 'all' || country !== 'all') && (
              <Button variant="ghost" className="rounded-lg" onClick={() => { setQ(''); setNat('all'); setTeam('all'); setCountry('all') }}>
                Clear filters
              </Button>
            )}
          </div>
        </CardHeader>
        <Table className="min-w-[1040px] text-[13.5px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {head('liveRank', 'Rank', undefined, true)}
              <TableHead className="h-11 text-[12.5px] font-medium text-ink-3">Player</TableHead>
              <TableHead className="h-11 text-[12.5px] font-medium text-ink-3">Country, team</TableHead>
              {head('p_balls', 'Pressure balls')}
              {head('trad', role === 'bat' ? 'Strike rate' : 'Economy', 'Under pressure, normal figure after the slash')}
              {head('p_rv100', 'Under pressure', 'Runs added per 100 pressure balls')}
              {head('n_rv100', 'Normally', 'Runs added per 100 ordinary balls')}
              {head('delta100', 'Rise', 'Pressure level minus normal level')}
              {head('wpa100', 'Impact', 'Win probability added per 100 pressure balls')}
              {head('cons', 'Consistency', 'Share of pressure innings or spells above average')}
              {head('p_top10', 'Stays top 10', 'Share of 400 reshuffled re-runs that keep the player in the top 10')}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id} onClick={() => open(p.id)} className="cursor-pointer border-line">
                <TableCell className="py-2.5 pl-5">
                  <span className={cn('display num text-[1.4rem]', top10.has(p.id) ? 'text-pink' : 'text-ink-3')}>{p.liveRank}</span>
                  {p.rank != null && p.liveRank !== p.rank && <span className="num ml-1.5 text-[11.5px] text-ink-3">was {p.rank}</span>}
                </TableCell>
                <TableCell className="py-2.5">
                  <span className="flex items-center gap-3">
                    <PlayerAvatar name={p.name} rr={p.ipl_team === 'Rajasthan Royals'} size={34} />
                    <span>
                      <a href={`/players/${role}/${p.id}/`} onClick={(e) => e.stopPropagation()} className="block font-medium hover:underline">
                        {p.name}
                      </a>
                      <span className="block text-[12px] text-ink-3">
                        {role === 'bowl' ? p.bowl_type : p.hand === 'LHB' ? 'Left-handed' : p.hand === 'RHB' ? 'Right-handed' : p.hand}
                      </span>
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  <span className="grid grid-cols-[28px_26px] items-center justify-items-center gap-1.5">
                    <Flag country={p.country} size={22} />
                    <TeamBadge team={p.ipl_team} size={24} />
                  </span>
                </TableCell>
                <TableCell className="num text-right">{fmt.int(p.p_balls)}</TableCell>
                <TableCell className="num text-right">
                  {role === 'bat' ? fmt.dec(p.press.sr, 0) : fmt.dec(p.press.econ, 2)}
                  <span className="text-ink-3"> / {role === 'bat' ? fmt.dec(p.norm.sr, 0) : fmt.dec(p.norm.econ, 2)}</span>
                </TableCell>
                <TableCell className="num text-right font-semibold">{fmt.signed(p.p_rv100)}</TableCell>
                <TableCell className="num text-right text-ink-2">{fmt.signed(p.n_rv100)}</TableCell>
                <TableCell className={cn('num text-right', p.delta100 >= 0 ? 'text-pink-ink' : 'text-blue')}>{fmt.signed(p.delta100)}</TableCell>
                <TableCell className="num text-right">{fmt.signed(p.wpa100, 2)}</TableCell>
                <TableCell className="num text-right">{fmt.pct(p.cons)}</TableCell>
                <TableCell className="pr-5">
                  <span className="flex items-center justify-end gap-2">
                    {p.boot ? (
                      <>
                        <Meter value={p.boot.p_top10} className="w-14" />
                        <span className="num w-9 text-right">{fmt.pct(p.boot.p_top10)}</span>
                      </>
                    ) : (
                      <span className="text-ink-3" title={`Re-run stability is calculated for the default bar (${bar.balls}+ pressure balls, ${bar.matches}+ matches)`}>
                        –
                      </span>
                    )}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
