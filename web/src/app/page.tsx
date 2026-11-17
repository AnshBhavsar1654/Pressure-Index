import Link from 'next/link'
import { WinWorm } from '@/components/charts/WinWorm'
import { Zoomable } from '@/components/charts/Zoom'
import { ordinal, signed } from '@/components/kit'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getRanked, getRole, getRR, getSummary } from '@/lib/data'
import { fmt, iplCode } from '@/lib/format'
import type { Gap, Player, Role } from '@/lib/types'
import { Spotlight, TopTen, type Lite } from '@/views/OverviewCards'

// Only the fields the cards render are sent to the browser.
const lite = (p: Player, role: Role): Lite => ({
  id: p.id,
  name: p.name,
  rank: p.rank ?? 0,
  team: p.ipl_team,
  country: p.country,
  rr: p.ipl_team === 'Rajasthan Royals',
  p_rv100: p.p_rv100,
  p_balls: p.p_balls,
  stay: p.boot?.p_top10 ?? 0,
  rate: role === 'bat' ? p.press.sr : (p.press.econ ?? null),
})

const phaseName = (g: Gap) => `${g.phase === 'Middle' ? 'middle-overs' : g.phase.toLowerCase()} ${g.discipline === 'bat' ? 'batting' : 'bowling'}`

export default function Overview() {
  const s = getSummary()
  const rr = getRR()
  const bat = getRanked('bat')
  const bowl = getRanked('bowl')
  // the RR win of 2026 that holds an RR player's biggest headline moment (a finish or a final-over defence)
  const rrIds = new Set(rr.squad.map((p) => p.id))
  const wins = new Map(rr.matches.filter((m) => m.won).map((m) => [m.id, m]))
  const star = (['bat', 'bowl'] as const)
    .flatMap((role) => getRole(role).players.filter((p) => rrIds.has(p.id)).flatMap((p) => p.moments.map((mo) => ({ p, mo }))))
    .filter(({ mo }) => mo.headline && wins.has(mo.id))
    .toSorted((a, b) => b.mo.wpa - a.mo.wpa)[0]
  const hero = star ? wins.get(star.mo.id)! : [...wins.values()].toSorted((a, b) => b.pressure_balls - a.pressure_balls)[0]
  const first = hero.scores['1']
  const second = hero.scores['2']
  const worst = rr.gaps[0]
  const best = rr.gaps[rr.gaps.length - 1]

  return (
    <div className="grid gap-5 xl:grid-cols-12">
      <section className="panel jersey flex flex-col justify-between gap-8 p-6 sm:p-8 xl:col-span-8">
        <div className="flex max-w-[40rem] flex-col gap-4">
          <Badge className="w-fit rounded-lg bg-black/25 px-3 py-1 text-[12.5px] font-medium text-white">SupeRR Selector Season 2</Badge>
          <h1 className="display text-[3rem] text-white sm:text-[4.2rem]">Who delivers when the match is on the line?</h1>
          <p className="max-w-[34rem] text-[16px] leading-relaxed text-white/85">
            Every one of {fmt.int(s.n_balls)} IPL and T20I deliveries since 2022 is scored for how much it could swing the
            result. Players are rated on what they did in the moments that mattered most.
          </p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <dl className="flex gap-8">
            {[
              ['Deliveries', `${Math.round(s.n_balls / 1000)}k`],
              ['Matches', String(s.n_matches)],
              ['Pressure moments', `${Math.round(s.contrast.pressure.balls / 1000)}k`],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[13px] text-white/70">{k}</dt>
                <dd className="display num text-[2.4rem] text-white">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="lg" className="rounded-lg bg-white px-5 text-royal hover:bg-white/90">
              <Link href="/picks/">My picks</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-lg border-white/40 bg-transparent px-5 text-white hover:bg-white/10 hover:text-white">
              <Link href="/rankings/bat/">Full rankings</Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="xl:col-span-4">
        <Spotlight bat={lite(bat[0], 'bat')} bowl={lite(bowl[0], 'bowl')} />
      </div>

      <section className="panel flex min-w-0 flex-col gap-3 p-5 xl:col-span-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="display text-[1.6rem]">{star ? 'RR’s biggest finish of 2026' : 'The tensest RR win of 2026'}</h2>
            <p className="text-[13.5px] text-ink-3">
              v {hero.opp}, {fmt.date(hero.date)}. RR’s chance of winning before every ball; pink bands are pressure moments.
            </p>
          </div>
          <Badge variant="secondary" className="rounded-lg px-3 py-1 text-[12.5px]">
            {iplCode(first.team)} {first.runs}/{first.wkts}, {iplCode(second.team)} {second.runs}/{second.wkts}
          </Badge>
        </div>
        <Zoomable label="match win probability">
          <WinWorm worm={hero.worm} animate height={300} labels={{ first: `${first.team} batting`, second: `${second.team} batting` }} />
        </Zoomable>
        <p className="text-[13.5px] text-ink-2">
          <b className="text-foreground">{hero.result}.</b>{' '}
          {star
            ? `${star.p.name}: ${star.mo.headline!.replace(/^./, (c) => c.toLowerCase())}, taking RR from ${fmt.chance(star.mo.wp_from)} to a win. The kind of moment the rankings are built on.`
            : 'The kind of finish the rankings are built on.'}
        </p>
      </section>

      <div className="xl:col-span-4 xl:row-span-2">
        <TopTen bat={bat.slice(0, 10).map((p) => lite(p, 'bat'))} bowl={bowl.slice(0, 10).map((p) => lite(p, 'bowl'))} />
      </div>

      <section className="panel grid gap-5 p-5 sm:p-6 xl:col-span-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center">
        <div className="flex flex-col gap-2">
          <h2 className="display text-[1.6rem]">Rajasthan Royals in 2026</h2>
          <p className="text-[14.5px] leading-relaxed text-ink-2">
            {ordinal(rr.summary.pos)} in the league with {rr.summary.won} wins from {rr.summary.played}, then{' '}
            {(rr.summary.playoff_result ?? '').replace(/^./, (c) => c.toLowerCase())}. The top order carried the side; the last five overs, with bat and ball,
            are where the title slipped away.
          </p>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[14px] font-semibold">
            <Link href="/rajasthan/" className="text-pink-ink hover:underline">
              Season review
            </Link>
            <Link href="/picks/#roles" className="text-pink-ink hover:underline">
              Shortlist by role
            </Link>
          </div>
        </div>
        <dl className="grid grid-cols-2 divide-x divide-line rounded-lg border border-line">
          <div className="px-4 py-3">
            <dt className="text-[12.5px] text-ink-3">Gained in {phaseName(best)}</dt>
            <dd className="display num text-[2.2rem] text-pink">{signed(best.gap_vs_avg)}</dd>
            <dd className="text-[12px] text-ink-3">runs a match, best in the league</dd>
          </div>
          <div className="px-4 py-3">
            <dt className="text-[12.5px] text-ink-3">Lost in {phaseName(worst)}</dt>
            <dd className="display num text-[2.2rem] text-blue">{signed(worst.gap_vs_avg)}</dd>
            <dd className="text-[12px] text-ink-3">runs a match, {ordinal(worst.rank)} of 10</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
