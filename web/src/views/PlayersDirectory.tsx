'use client'

import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import Link from 'next/link'
import { useDeferredValue, useMemo, useState } from 'react'
import { Flag } from '@/components/Flag'
import { NAT_OPTIONS, natMatch, Pick, Segmented, type Nat } from '@/components/filters'
import { PlayerAvatar, signed } from '@/components/kit'
import { TeamBadge } from '@/components/TeamBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

export type RoleLine = { rank: number | null; balls: number; matches: number; rv100: number; rate: number | null }
export type DirRow = {
  id: number
  name: string
  country: string | null
  team: string | null
  kind: 'Batter' | 'Bowler' | 'All-rounder'
  bat?: RoleLine
  bowl?: RoleLine
  balls: number
}

type Kind = 'all' | 'Batter' | 'Bowler' | 'All-rounder'
type Ranked = 'all' | 'ranked'
type SortKey = 'name' | 'balls' | 'batRank' | 'bowlRank' | 'batRv' | 'bowlRv'
const PAGE = 50

/** Every player with a profile page, filterable and sortable. */
export function PlayersDirectory({ rows: all }: { rows: DirRow[] }) {
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<Kind>('all')
  const [nat, setNat] = useState<Nat>('all')
  const [team, setTeam] = useState('all')
  const [country, setCountry] = useState('all')
  const [ranked, setRanked] = useState<Ranked>('all')
  const [minBalls, setMinBalls] = useState(1)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'balls', dir: -1 })
  const [shown, setShown] = useState(PAGE)
  const dq = useDeferredValue(q)
  const dMin = useDeferredValue(minBalls)

  const teams = useMemo(() => [...new Set(all.map((r) => r.team).filter((t): t is string => !!t))].sort(), [all])
  const countries = useMemo(() => [...new Set(all.map((r) => r.country).filter((t): t is string => !!t))].sort(), [all])

  const rows = useMemo(() => {
    const term = dq.trim().toLowerCase()
    const val = (r: DirRow): number | string => {
      switch (sort.key) {
        case 'name':
          return r.name
        case 'batRank':
          return r.bat?.rank ?? 1e6
        case 'bowlRank':
          return r.bowl?.rank ?? 1e6
        case 'batRv':
          return r.bat?.rv100 ?? -1e6
        case 'bowlRv':
          return r.bowl?.rv100 ?? -1e6
        default:
          return r.balls
      }
    }
    return all
      .filter(
        (r) =>
          (!term || r.name.toLowerCase().includes(term)) &&
          (kind === 'all' || r.kind === kind) &&
          natMatch(nat, r.country) &&
          (team === 'all' || r.team === team) &&
          (country === 'all' || r.country === country) &&
          (ranked === 'all' || r.bat?.rank != null || r.bowl?.rank != null) &&
          r.balls >= dMin,
      )
      .toSorted((a, b) => {
        const x = val(a)
        const y = val(b)
        return (typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number)) * sort.dir
      })
  }, [all, dq, kind, nat, team, country, ranked, dMin, sort])

  const filtered = q || kind !== 'all' || nat !== 'all' || team !== 'all' || country !== 'all' || ranked !== 'all' || minBalls !== 1
  const clear = () => {
    setQ('')
    setKind('all')
    setNat('all')
    setTeam('all')
    setCountry('all')
    setRanked('all')
    setMinBalls(1)
  }

  const head = (key: SortKey, label: string, title?: string, left = false) => (
    <TableHead className={cn('h-11 text-[12.5px] font-medium text-ink-3', !left && 'text-right')} title={title} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button
        className={cn('hover:text-foreground', sort.key === key && 'font-semibold text-foreground')}
        onClick={() => {
          setShown(PAGE)
          setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === 'name' || key.endsWith('Rank') ? 1 : -1 }))
        }}
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
          <CardTitle>Find a player</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative block">
              <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <Input value={q} onChange={(e) => (setQ(e.target.value), setShown(PAGE))} placeholder="Search by name" className="h-10 w-60 rounded-lg pl-9" aria-label="Search players" />
            </label>
            <Segmented
              label="Role"
              value={kind}
              onChange={(v) => (setKind(v), setShown(PAGE))}
              options={[
                { value: 'all', label: 'All roles' },
                { value: 'Batter', label: 'Batters' },
                { value: 'Bowler', label: 'Bowlers' },
                { value: 'All-rounder', label: 'All-rounders' },
              ]}
            />
            <Segmented label="Nationality" value={nat} onChange={(v) => (setNat(v), setShown(PAGE))} options={NAT_OPTIONS} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Pick label="IPL team" value={team} onChange={(v) => (setTeam(v), setShown(PAGE))} options={teams} allLabel="All IPL teams" />
            <Pick label="Country" value={country} onChange={(v) => (setCountry(v), setShown(PAGE))} options={countries} allLabel="All countries" />
            <Segmented
              label="Ranking"
              value={ranked}
              onChange={(v) => (setRanked(v), setShown(PAGE))}
              options={[
                { value: 'all', label: 'Everyone' },
                { value: 'ranked', label: 'In the submitted ranking' },
              ]}
            />
            <div className="flex min-w-80 items-center gap-3 rounded-lg border border-line bg-panel-2 px-3 py-1.5">
              <span id="dir-min" className="shrink-0 text-[12.5px] text-ink-2">
                Min pressure balls
              </span>
              <Slider className="min-w-32 flex-1" aria-labelledby="dir-min" min={1} max={300} step={1} value={[minBalls]} onValueChange={([v]) => (setMinBalls(v), setShown(PAGE))} />
              <span className="display num w-9 text-right text-[1.3rem] text-pink">{minBalls}</span>
            </div>
            {filtered && (
              <Button variant="ghost" className="rounded-lg" onClick={clear}>
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 pb-0">
        <CardHeader className="border-b pb-4">
          <CardTitle>
            {rows.length === all.length ? `All ${all.length} players` : `${rows.length} of ${all.length} players`}
          </CardTitle>
        </CardHeader>
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-[14px] text-ink-3">No player matches these filters. Clear a filter or lower the minimum balls.</p>
        ) : (
          <Table className="min-w-[1000px] text-[13.5px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {head('name', 'Player', undefined, true)}
                <TableHead className="h-11 text-[12.5px] font-medium text-ink-3">Country, team</TableHead>
                <TableHead className="h-11 text-[12.5px] font-medium text-ink-3">Role</TableHead>
                {head('balls', 'Pressure balls', 'Batting and bowling combined')}
                {head('batRank', 'Batting rank', 'Rank in the submitted batting ranking')}
                {head('batRv', 'Batting, runs added', 'Runs added per 100 pressure balls faced')}
                {head('bowlRank', 'Bowling rank', 'Rank in the submitted bowling ranking')}
                {head('bowlRv', 'Bowling, runs saved', 'Runs saved per 100 pressure balls bowled')}
                <TableHead className="h-11 pr-5 text-right text-[12.5px] font-medium text-ink-3">Profiles</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, shown).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="py-2 pl-5">
                    <span className="flex items-center gap-3">
                      <PlayerAvatar name={r.name} rr={r.team === 'Rajasthan Royals'} size={32} />
                      <Link href={`/players/${r.bat && (!r.bowl || r.bat.balls >= r.bowl.balls) ? 'bat' : 'bowl'}/${r.id}/`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="grid grid-cols-[28px_26px] items-center justify-items-center gap-1.5">
                      <Flag country={r.country} size={22} />
                      <TeamBadge team={r.team} size={24} />
                    </span>
                  </TableCell>
                  <TableCell className="text-ink-2">{r.kind}</TableCell>
                  <TableCell className="num text-right">{r.balls}</TableCell>
                  <TableCell className="num text-right">{r.bat?.rank != null ? <span className="display text-[1.15rem] text-pink">{r.bat.rank}</span> : '–'}</TableCell>
                  <TableCell className="num text-right">{r.bat ? signed(r.bat.rv100) : '–'}</TableCell>
                  <TableCell className="num text-right">{r.bowl?.rank != null ? <span className="display text-[1.15rem] text-pink">{r.bowl.rank}</span> : '–'}</TableCell>
                  <TableCell className="num text-right">{r.bowl ? signed(r.bowl.rv100) : '–'}</TableCell>
                  <TableCell className="pr-5">
                    <span className="flex justify-end gap-1.5">
                      {r.bat && (
                        <Button asChild variant="outline" size="sm" className="rounded-md">
                          <Link href={`/players/bat/${r.id}/`}>Batting</Link>
                        </Button>
                      )}
                      {r.bowl && (
                        <Button asChild variant="outline" size="sm" className="rounded-md">
                          <Link href={`/players/bowl/${r.id}/`}>Bowling</Link>
                        </Button>
                      )}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {rows.length > shown && (
          <div className="flex items-center justify-center gap-3 border-t px-5 py-4">
            <span className="text-[13px] text-ink-3">
              Showing {shown} of {rows.length}
            </span>
            <Button variant="outline" className="rounded-lg" onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(PAGE, rows.length - shown)} more
            </Button>
            <Button variant="ghost" className="rounded-lg" onClick={() => setShown(rows.length)}>
              Show all
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
