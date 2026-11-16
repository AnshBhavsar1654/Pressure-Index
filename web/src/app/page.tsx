import { CrownIcon, TrendDownIcon, TrendUpIcon } from '@phosphor-icons/react/dist/ssr'
import Link from 'next/link'
import { WinWorm } from '@/components/charts/WinWorm'
import { ordinal, signed } from '@/components/kit'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getRole, getRR, getSummary } from '@/lib/data'
import { fmt, iplCode } from '@/lib/format'
import type { Gap, Player, Role } from '@/lib/types'
import { Spotlight, TopTen, type Lite } from '@/views/OverviewCards'

// Only the fields the cards render are sent to the browser.
const lite = (p: Player, role: Role): Lite => ({
  id: p.id,
  name: p.name,
  rank: p.rank,
  team: p.ipl_team,
  country: p.country,
  rr: p.ipl_team === 'Rajasthan Royals',
  p_rv100: p.p_rv100,
  p_balls: p.p_balls,
  stay: p.boot.p_top10,
  rate: role === 'bat' ? p.press.sr : (p.press.econ ?? null),
  rateNormal: role === 'bat' ? p.norm.sr : (p.norm.econ ?? null),
  extra: '',
})

const phaseName = (g: Gap) => `${g.phase === 'Middle' ? 'middle-overs' : g.phase.toLowerCase()} ${g.discipline === 'bat' ? 'batting' : 'bowling'}`

export default function Overview() {
  const s = getSummary()
  const rr = getRR()
  const bat = getRole('bat').players
  const bowl = getRole('bowl').players
  const hero = rr.matches.filter((m) => m.won).toSorted((a, b) => b.pressure_balls - a.pressure_balls)[0]
  const first = hero.scores['1']
  const second = hero.scores['2']
  const worst = rr.gaps[0]
  const best = rr.gaps[rr.gaps.length - 1]

  return (
    <div className="grid gap-5 xl:grid-cols-12">
      <section className="panel jersey flex flex-col justify-between gap-8 p-6 sm:p-8 xl:col-span-8">
        <div className="flex max-w-[40rem] flex-col gap-4">
          <Badge className="w-fit rounded-full bg-black/25 px-3 py-1 text-[12.5px] font-medium text-white">SupeRR Selector Season 2</Badge>
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
            <Button asChild size="lg" className="rounded-full bg-white px-5 text-royal hover:bg-white/90">
              <Link href="/rankings/bat/">See the rankings</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full border-white/40 bg-transparent px-5 text-white hover:bg-white/10 hover:text-white">
              <Link href="/auction/">RR auction plan</Link>
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
            <h2 className="display text-[1.6rem]">The tensest RR win of 2026</h2>
            <p className="text-[13.5px] text-ink-3">
              v {hero.opp}, {fmt.date(hero.date)}. RR’s chance of winning before every ball; pink bands are pressure moments.
            </p>
          </div>
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-[12.5px]">
            {iplCode(first.team)} {first.runs}/{first.wkts}, {iplCode(second.team)} {second.runs}/{second.wkts}
          </Badge>
        </div>
        <WinWorm worm={hero.worm} animate height={300} labels={{ first: `${first.team} batting`, second: `${second.team} batting` }} />
        <p className="text-[13.5px] text-ink-2">
          <b className="text-foreground">{hero.result}.</b> GT needed 11 off the last over with three wickets left. Tushar
          Deshpande gave away four singles and took a wicket: the kind of moment the rankings are built on.
        </p>
      </section>

      <div className="xl:col-span-4 xl:row-span-2">
        <TopTen bat={bat.slice(0, 10).map((p) => lite(p, 'bat'))} bowl={bowl.slice(0, 10).map((p) => lite(p, 'bowl'))} />
      </div>

      <div className="grid gap-5 sm:grid-cols-3 xl:col-span-8">
        <Link href="/rajasthan/" className="panel group flex flex-col gap-3 p-5 transition-colors hover:border-line-strong">
          <span className="grid size-10 place-items-center rounded-xl bg-pink-soft text-pink">
            <CrownIcon size={20} weight="fill" />
          </span>
          <span className="text-[13px] text-ink-3">RR in IPL 2026</span>
          <span className="display text-[2.1rem]">
            {ordinal(rr.summary.pos)}, {rr.summary.won} wins
          </span>
          <span className="text-[13.5px] leading-relaxed text-ink-2">{rr.summary.playoff_result}.</span>
        </Link>
        <Link href="/rajasthan/" className="panel group flex flex-col gap-3 p-5 transition-colors hover:border-line-strong">
          <span className="grid size-10 place-items-center rounded-xl bg-blue-soft text-blue">
            <TrendUpIcon size={20} weight="bold" />
          </span>
          <span className="text-[13px] text-ink-3">Biggest strength</span>
          <span className="display num text-[2.1rem] text-pink">{signed(best.gap_vs_avg)} runs</span>
          <span className="text-[13.5px] leading-relaxed text-ink-2">a match from {phaseName(best)}, best of all 10 teams.</span>
        </Link>
        <Link href="/auction/" className="panel group flex flex-col gap-3 p-5 transition-colors hover:border-gold/50">
          <span className="grid size-10 place-items-center rounded-xl bg-gold-soft text-gold">
            <TrendDownIcon size={20} weight="bold" />
          </span>
          <span className="text-[13px] text-ink-3">Biggest leak</span>
          <span className="display num text-[2.1rem] text-blue">{signed(worst.gap_vs_avg)} runs</span>
          <span className="text-[13.5px] leading-relaxed text-ink-2">a match in {phaseName(worst)}. See who fixes it.</span>
        </Link>
      </div>
    </div>
  )
}
