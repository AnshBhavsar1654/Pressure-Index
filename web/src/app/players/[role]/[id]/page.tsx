import { CaretLeftIcon, CaretRightIcon, ScalesIcon } from '@phosphor-icons/react/dist/ssr'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PlayerAvatar, RankRibbon, signed } from '@/components/kit'
import { Flag } from '@/components/Flag'
import { TeamBadge } from '@/components/TeamBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Term } from '@/components/Term'
import { getQualified, getRole, getSummary } from '@/lib/data'
import { EXCLUDED_LONG } from '@/lib/terms'
import { fmt } from '@/lib/format'
import { rescore, type Player, type Role } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ProfileCharts } from '@/views/Profile'

type Params = { role: Role; id: string }

export function generateStaticParams() {
  return (['bat', 'bowl'] as const).flatMap((role) => getRole(role).players.map((p) => ({ role, id: String(p.id) })))
}

function find(role: Role, id: string) {
  const list = getRole(role).players
  const i = list.findIndex((p) => String(p.id) === id)
  const total = list.filter((p) => p.rank != null).length
  return { p: list[i], prev: list[i - 1], next: list[i + 1], total, bar: getRole(role).eligibility }
}

/** Rating ingredients as z-scores against the default pool (the player is added if outside it). */
function zFor(role: Role, p: Player) {
  const pool = getQualified(role)
  const scored = rescore(p.merit_rank != null ? pool : [...pool, p], getSummary().weights)
  return scored.find((x) => x.id === p.id)!.z
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { role, id } = await params
  const { p } = find(role, id)
  return { title: p ? `${p.name}, ${role === 'bat' ? 'batting' : 'bowling'} under pressure` : 'Player' }
}

/** One sentence that sums the player up, generated from the numbers. */
function story(p: Player, role: Role) {
  const last = p.name.split(' ').slice(-1)[0]
  if (role === 'bat') {
    const up = (p.press.sr ?? 0) >= (p.norm.sr ?? 0)
    return `Under pressure ${last} strikes at ${fmt.dec(p.press.sr, 0)}, ${up ? 'up from' : 'down from'} ${fmt.dec(p.norm.sr, 0)} in normal moments, and averages ${fmt.dec(p.press.avg, 1)} runs per dismissal. Allowing for how hard those situations were, that is ${signed(p.p_rv100)} runs per 100 balls against an average batter.`
  }
  const up = (p.press.econ ?? 99) <= (p.norm.econ ?? 99)
  return `Under pressure ${last} concedes ${fmt.dec(p.press.econ, 2)} an over (${up ? 'tighter than' : 'looser than'} ${fmt.dec(p.norm.econ, 2)} normally) and takes a wicket every ${fmt.dec(p.press.sr, 0)} balls. Allowing for the situations, that saves ${signed(p.p_rv100)} runs per 100 balls against an average bowler.`
}

function cmp(a: number | null | undefined, b: number | null | undefined, dir: 1 | -1): boolean | null {
  if (a == null || b == null || a === b) return null
  return (a - b) * dir > 0
}

export default async function PlayerPage({ params }: { params: Promise<Params> }) {
  const { role, id } = await params
  const { p, prev, next, total, bar } = find(role, id)
  if (!p) notFound()
  const isBat = role === 'bat'
  const rr = p.ipl_team === 'Rajasthan Royals'
  const rows: [string, string, string, boolean | null][] = isBat
    ? [
        ['Strike rate', fmt.dec(p.press.sr), fmt.dec(p.norm.sr), cmp(p.press.sr, p.norm.sr, 1)],
        ['Runs per dismissal', fmt.dec(p.press.avg), fmt.dec(p.norm.avg), cmp(p.press.avg, p.norm.avg, 1)],
        ['Dot balls', `${fmt.dec(p.press.dot_pct)}%`, `${fmt.dec(p.norm.dot_pct)}%`, cmp(p.press.dot_pct, p.norm.dot_pct, -1)],
        ['Boundary balls', `${fmt.dec(p.press.bnd_pct)}%`, `${fmt.dec(p.norm.bnd_pct)}%`, cmp(p.press.bnd_pct, p.norm.bnd_pct, 1)],
        ['Balls, runs, outs', `${p.press.balls}, ${p.press.runs}, ${p.press.outs}`, `${p.norm.balls}, ${p.norm.runs}, ${p.norm.outs}`, null],
      ]
    : [
        ['Economy', fmt.dec(p.press.econ, 2), fmt.dec(p.norm.econ, 2), cmp(p.press.econ, p.norm.econ, -1)],
        ['Balls per wicket', fmt.dec(p.press.sr), fmt.dec(p.norm.sr), cmp(p.press.sr, p.norm.sr, -1)],
        ['Dot balls', `${fmt.dec(p.press.dot_pct)}%`, `${fmt.dec(p.norm.dot_pct)}%`, cmp(p.press.dot_pct, p.norm.dot_pct, 1)],
        ['Boundaries conceded', `${fmt.dec(p.press.bnd_pct)}%`, `${fmt.dec(p.norm.bnd_pct)}%`, cmp(p.press.bnd_pct, p.norm.bnd_pct, -1)],
        ['Balls, runs, wickets', `${p.press.balls}, ${p.press.runs}, ${p.press.outs}`, `${p.norm.balls}, ${p.norm.runs}, ${p.norm.outs}`, null],
      ]
  const bannerStats: [ReactNode, string][] = [
    [isBat ? 'Strike rate under pressure' : 'Economy under pressure', isBat ? fmt.dec(p.press.sr, 0) : fmt.dec(p.press.econ, 2)],
    [<Term key="u" k="underPressure" role={role}>{isBat ? 'Runs added per 100' : 'Runs saved per 100'}</Term>, signed(p.p_rv100)],
    ['Pressure balls', fmt.int(p.p_balls)],
    [<Term key="c" k="confidence" />, p.boot ? fmt.pct(p.boot.p_top10) : '–'],
    [<Term key="r" k="rankRange" />, p.boot ? `${p.boot.rank_lo}–${p.boot.rank_hi}` : '–'],
    ['Matches with pressure', String(p.p_matches)],
  ]

  return (
    <div className="flex flex-col gap-5">
      <nav className="flex flex-wrap items-center justify-between gap-2" aria-label="Player navigation">
        <Button asChild variant="ghost" className="rounded-lg px-3">
          <Link href={`/rankings/${role}/`}>
            <CaretLeftIcon data-icon="inline-start" />
            All {isBat ? 'batters' : 'bowlers'}
          </Link>
        </Button>
        <span className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="rounded-lg">
            <Link href={`/compare/?role=${role}&ids=${p.id}`}>
              <ScalesIcon data-icon="inline-start" />
              Compare
            </Link>
          </Button>
          {prev && (
            <Button asChild variant="outline" size="sm" className="rounded-lg">
              <Link href={`/players/${role}/${prev.id}/`}>
                <CaretLeftIcon data-icon="inline-start" />
                {prev.name}
              </Link>
            </Button>
          )}
          {next && (
            <Button asChild variant="outline" size="sm" className="rounded-lg">
              <Link href={`/players/${role}/${next.id}/`}>
                {next.name}
                <CaretRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          )}
        </span>
      </nav>

      <section className={cn('panel jersey grid gap-6 p-6 sm:p-7 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]', !rr && 'jersey-royal')}>
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-4">
            <RankRibbon rank={p.rank ?? '–'} className="-mt-7 shrink-0" />
            <div className="flex min-w-0 items-center gap-4">
              <PlayerAvatar name={p.name} rr size={76} className="bg-white/85" />
              <div className="min-w-0">
                <h1 className="display text-[2.6rem] text-white sm:text-[3.2rem]">{p.name}</h1>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {p.country && (
                    <Badge className="rounded-lg bg-black/25 pl-1 text-white">
                      <Flag country={p.country} size={18} />
                      {p.country}
                    </Badge>
                  )}
                  {p.ipl_team && (
                    <Badge className="rounded-lg bg-black/25 pl-0.5 text-white">
                      <TeamBadge team={p.ipl_team} size={18} />
                      IPL {p.ipl_season}
                    </Badge>
                  )}
                  <Badge className="rounded-lg bg-black/25 text-white">{isBat ? p.hand : p.bowl_type}</Badge>
                </div>
              </div>
            </div>
          </div>
          <p className="max-w-[60ch] text-[15px] leading-relaxed text-white/85">{story(p, role)}</p>
          <p className="text-[13px] text-white/65">
            {p.rank != null
              ? `Ranked ${p.rank} of the ${total} qualified ${isBat ? 'batters' : 'bowlers'} RR could sign.`
              : p.excluded
                ? `${EXCLUDED_LONG[p.excluded]}${p.merit_rank != null ? ` On the numbers alone, they would rank ${p.merit_rank} of ${bar.n_eligible} qualified ${isBat ? 'batters' : 'bowlers'}.` : ''}`
                : `Fewer than ${bar.min_pressure_balls} pressure balls across ${bar.min_pressure_matches} matches, so not enough evidence to rank them yet. Treat these numbers as an early read.`}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-2.5 self-end sm:grid-cols-3">
          {bannerStats.map(([k, v], i) => (
            <div key={i} className="rounded-lg bg-black/20 px-4 py-3">
              <dt className="text-[12.5px] text-white/70">{k}</dt>
              <dd className="display num mt-1 text-[2rem] text-white">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Card className="gap-0 pb-0">
        <CardHeader className="border-b pb-4">
          <CardTitle>Pressure moments against normal moments</CardTitle>
          <CardDescription>Raw numbers, no adjustment. Pink marks the better column.</CardDescription>
        </CardHeader>
        <Table className="min-w-[520px] text-[14px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5" />
              <TableHead className="text-right text-ink-3">Under pressure</TableHead>
              <TableHead className="pr-5 text-right text-ink-3">Normal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(([label, a, b, better]) => (
              <TableRow key={label}>
                <TableCell className="py-2.5 pl-5 text-ink-2">{label}</TableCell>
                <TableCell className={cn('num text-right font-semibold', better === true && 'text-pink-ink')}>{a}</TableCell>
                <TableCell className={cn('num pr-5 text-right', better === false ? 'font-semibold text-pink-ink' : 'text-ink-2')}>{b}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <CardContent className="grid grid-cols-3 gap-3 border-t py-4">
          {p.phases.map((ph) => (
            <div key={ph.phase} className="rounded-xl bg-panel-2/70 px-4 py-3">
              <div className="text-[12.5px] text-ink-3">{ph.phase === 'Middle' ? 'Middle overs' : ph.phase} pressure</div>
              <div className="display num text-[1.6rem]">{signed(ph.rv100)}</div>
              <div className="num text-[12px] text-ink-3">{ph.balls} balls</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <ProfileCharts p={{ ...p, z: zFor(role, p) }} role={role} />
    </div>
  )
}
