'use client'

import { ArrowCounterClockwiseIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import { useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import { ChartFrame, Legend } from '@/components/charts/core'
import { NAT_OPTIONS, natMatch, Pick, Segmented, type Nat } from '@/components/filters'
import { PressureScatter } from '@/components/charts/Scatter'
import { Meter, PlayerAvatar, RetainedMark } from '@/components/kit'
import { EmergingTag } from '@/components/Term'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Flag } from '@/components/Flag'
import { TeamBadge } from '@/components/TeamBadge'
import { fmt } from '@/lib/format'
import { Term } from '@/components/Term'
import { excludedNote, winPts } from '@/lib/terms'
import { INDIAN_BAR, rescore, type Player, type Role, type ScoredPlayer } from '@/lib/types'
import { cn } from '@/lib/utils'

type SortKey = 'liveRank' | 'p_rv100' | 'n_rv100' | 'delta100' | 'wpa100' | 'cons' | 'p_balls' | 'p_top10' | 'trad'

export function Leaderboard({
  role,
  players: all,
  bar,
  total: everyone,
}: {
  role: Role
  players: Player[]
  /** recentBalls: the fixed 2025-26 evidence rule */
  bar: { balls: number; matches: number; minBalls: number; minMatches: number; recentBalls: number }
  /** every player with a pressure ball, not only those the sliders can reach */
  total: number
}) {
  const router = useRouter()
  const [minBalls, setMinBalls] = useState(bar.balls)
  const [minMatches, setMinMatches] = useState(bar.matches)
  const dBalls = useDeferredValue(minBalls)
  const dMatches = useDeferredValue(minMatches)
  // who qualifies: everyone at or above the chosen bar is rated against each other
  const raw = useMemo(
    // Indian players need a third of the evidence: the data pack has no domestic cricket, only their IPL games
    () => all.filter((p) => {
      const f = p.indian ? INDIAN_BAR : 1
      const need = (x: number) => Math.ceil(x * f - 1e-9)
      return p.p_balls >= need(dBalls) && p.p_matches >= need(dMatches) && p.r_balls >= need(bar.recentBalls)
    }),
    [all, dBalls, dMatches, bar.recentBalls],
  )
  const barChanged = minBalls !== bar.balls || minMatches !== bar.matches
  const [q, setQ] = useState('')
  const [nat, setNat] = useState<Nat>('all')
  const [team, setTeam] = useState('all')
  const [country, setCountry] = useState('all')
  const [who, setWho] = useState<'signable' | 'all'>('signable')
  const teams = useMemo(() => [...new Set(all.map((p) => p.ipl_team).filter((t): t is string => !!t))].sort(), [all])
  const countries = useMemo(() => [...new Set(all.map((p) => p.country).filter((t): t is string => !!t))].sort(), [all])
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'liveRank', dir: 1 })
  const players = useMemo(() => rescore(raw), [raw])
  const top10 = useMemo(() => new Set(players.filter((p) => p.liveRank != null && p.liveRank <= 10).map((p) => p.id)), [players])
  const signable = players.filter((p) => p.liveRank != null).length
  const noun = role === 'bat' ? 'batters' : 'bowlers'
  const open = (id: number) => router.push(`/players/${role}/${id}/`)

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    const val = (p: ScoredPlayer): number =>
      // rank order follows the rating, so players RR cannot recommend sit where their rating puts them
      sort.key === 'liveRank' ? -p.liveScore : sort.key === 'p_top10' ? (p.boot?.p_top10 ?? -1) : sort.key === 'trad' ? ((role === 'bat' ? p.press.sr : p.press.econ) ?? 0) : ((p[sort.key] as number | null) ?? -1)
    return players
      .filter((p) => !term || [p.name, p.country ?? '', p.ipl_team ?? ''].some((s) => s.toLowerCase().includes(term)))
      .filter((p) => natMatch(nat, p.country) && (team === 'all' || p.ipl_team === team) && (country === 'all' || p.country === country))
      .filter((p) => who === 'all' || p.liveRank != null)
      .toSorted((a, b) => (val(a) - val(b)) * sort.dir)
  }, [players, q, sort, role, nat, team, country, who])

  const head = (key: SortKey, label: ReactNode, left = false) => (
    <TableHead className={cn('h-11 text-[12.5px] font-medium text-ink-3', !left && 'text-right')} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
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
            My ranking needs {bar.balls}+ pressure balls across {bar.matches}+ matches, {bar.recentBalls}+ of them in 2025–26 (a third of
            that for Indian players, whose only top-level cricket in the data is the IPL).
            Lower the bar to see more players, or raise it to keep only long records. The rating leans on each player’s usual
            level until his pressure record is long, so short records cannot run away with the top spots.
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

      <ChartFrame
        title="Normal level against pressure level"
        subtitle={`Every qualified ${role === 'bat' ? 'batter' : 'bowler'}. Further right means better in normal moments, higher means better under pressure. Above the diagonal line, a player gets better when it matters. Bigger dots have more pressure balls behind them. Click a dot to open the player.`}
        legend={
          <Legend
            items={[
              { label: 'Current top 10', color: 'var(--pink)' },
              { label: `Other ${noun}`, color: 'var(--neutral-mark)' },
            ]}
          />
        }
        footnote={`Runs ${role === 'bat' ? 'added' : 'saved'} per 100 balls, compared with an average ${role === 'bat' ? 'batter' : 'bowler'} in exactly the same match situations.`}
      >
        <PressureScatter role={role} players={players} highlight={top10} onSelect={open} height={460} />
      </ChartFrame>

      <Card className="gap-0 pb-0">
        <CardHeader className="border-b pb-4">
          <CardTitle>
            {who === 'signable' && rows.length === signable
              ? `All ${signable} qualified ${noun} RR can sign`
              : `${rows.length} of ${who === 'signable' ? signable : players.length} ${noun}`}
          </CardTitle>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="relative block">
              <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" className="h-10 w-56 rounded-lg pl-9" aria-label={`Search ${noun}`} />
            </label>
            <Segmented
              label="Who to show"
              value={who}
              onChange={setWho}
              options={[
                { value: 'signable', label: 'Players RR can sign' },
                { value: 'all', label: 'Everyone' },
              ]}
            />
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
              {head('liveRank', <Term k="rank" />, true)}
              <TableHead className="h-11 text-[12.5px] font-medium text-ink-3">Player</TableHead>
              <TableHead className="h-11 text-[12.5px] font-medium text-ink-3">Country, team</TableHead>
              {head('p_balls', <Term k="pressureBalls" />)}
              {head('trad', <Term k="rate" role={role} />)}
              {head('p_rv100', <Term k="underPressure" role={role} />)}
              {head('n_rv100', <Term k="normal" />)}
              {head('delta100', <Term k="lift" />)}
              {head('wpa100', <Term k="winImpact" />)}
              {head('cons', <Term k="consistency" role={role} />)}
              {head('p_top10', <Term k="confidence" />)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id} onClick={() => open(p.id)} className="cursor-pointer border-line">
                <TableCell className="py-2.5 pl-5">
                  {p.liveRank != null ? (
                    <>
                      <span className={cn('display num text-[1.4rem]', top10.has(p.id) ? 'text-pink' : 'text-ink-3')}>{p.liveRank}</span>
                      {p.rank != null && p.liveRank !== p.rank && <span className="num ml-1.5 text-[11.5px] text-ink-3">was {p.rank}</span>}
                    </>
                  ) : (
                    <span className="block max-w-[7rem] text-[11.5px] leading-tight text-ink-3">{p.excluded ? excludedNote(p) : '–'}</span>
                  )}
                </TableCell>
                <TableCell className="py-2.5">
                  <span className="flex items-center gap-3">
                    <PlayerAvatar name={p.name} rr={p.ipl_team === 'Rajasthan Royals'} size={34} />
                    <span>
                      <span className="flex items-center gap-1.5">
                        <a href={`/players/${role}/${p.id}/`} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">
                          {p.name}
                        </a>
                        {p.retained_by && <RetainedMark team={p.retained_by} size={17} />}
                        {p.emerging && <EmergingTag />}
                      </span>
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
                <TableCell className="num text-right">{winPts(p.wpa100)}</TableCell>
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
