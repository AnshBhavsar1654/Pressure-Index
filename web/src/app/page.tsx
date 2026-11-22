import { ArrowRightIcon } from '@phosphor-icons/react/dist/ssr'
import Link from 'next/link'
import { WinWorm } from '@/components/charts/WinWorm'
import { Zoomable } from '@/components/charts/Zoom'
import { Button } from '@/components/ui/button'
import { getLab, getMatchDetail, getMatches, getRanked, getSummary } from '@/lib/data'
import { fmt } from '@/lib/format'
import type { MatchDetail, Player, Role } from '@/lib/types'
import { Spotlight, TopTen, type Lite } from '@/views/OverviewCards'

// Only the fields the cards render are sent to the browser.
const lite = (p: Player, role: Role): Lite => ({
  id: p.id,
  name: p.name,
  rank: p.rank ?? 0,
  team: p.ipl_team,
  country: p.country,
  p_rv100: p.p_rv100,
  p_balls: p.p_balls,
  stay: p.boot?.p_top10 ?? 0,
  rate: role === 'bat' ? p.press.sr : (p.press.econ ?? null),
})

const worm = (m: MatchDetail) => m.balls.map((b, i) => [i, b[2], b[4], b[0]] as [number, number, number, number])

export default function Overview() {
  const s = getSummary()
  const lab = getLab()
  const bat = getRanked('bat')
  const bowl = getRanked('bowl')
  // the featured match: the most dramatic World Cup final (sum of win-probability swings), else any final
  const finals = getMatches().filter((m) => m.stage === 'Final')
  const pick =
    finals.filter((m) => m.comp.includes('World Cup')).toSorted((a, b) => b.drama - a.drama)[0] ??
    finals.toSorted((a, b) => b.drama - a.drama)[0]
  const hero = getMatchDetail(pick.id)
  const [i1, i2] = hero.innings
  const big = hero.swings[0]
  const chase = s.wp_model['2']
  const cmp = lab.wp_comparison?.innings['2'].cv

  const steps = [
    { k: '01', t: 'Ingest', d: `${fmt.int(s.n_matches)} matches of Cricsheet JSON → canonical tables`, m: `${Math.round(s.n_balls / 1000)}k balls` },
    { k: '02', t: 'Run expectancy', d: 'Monotonic gradient boosting: runs still to come from any state', m: 'HistGBM' },
    { k: '03', t: 'Win probability', d: 'Logistic model on engineered resources + exact final-over Markov chain', m: `AUC ${chase.auc.toFixed(3)}` },
    { k: '04', t: 'Pressure & ratings', d: 'Stakes of every ball, runs added vs average, empirical-Bayes shrinkage', m: `K = ${s.K}` },
    { k: '05', t: 'Validation', d: 'Match-grouped CV, walk-forward backtests, 400× bootstrap', m: `${s.forward.bowl.n + s.forward.bat.n} tests` },
  ]

  return (
    <div className="grid gap-5 xl:grid-cols-12">
      <section className="panel grid-hero flex flex-col justify-between gap-8 p-6 sm:p-8 xl:col-span-8">
        <div className="flex max-w-[44rem] flex-col gap-4">
          <span className="eyebrow">Machine learning · Sports analytics · {s.seasons[0]}–{s.seasons.at(-1)}</span>
          <h1 className="display text-[2.5rem] sm:text-[3.4rem]">
            Who performs when the match is <span className="text-signal-ink">on the line</span>?
          </h1>
          <p className="max-w-[38rem] text-[16px] leading-relaxed text-ink-2">
            An end-to-end ML system over every IPL and T20 international ball since {s.seasons[0]}: a win-probability model scores how much each
            delivery could swing the result, and every batter and bowler is rated on the balls that mattered most, against their own usual level.
          </p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
            {[
              ['Deliveries', `${Math.round(s.n_balls / 1000)}k`],
              ['Matches', fmt.int(s.n_matches)],
              ['Chase WP AUC', chase.auc.toFixed(3)],
              ['Pressure balls', `${Math.round(s.contrast.pressure.balls / 1000)}k`],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="eyebrow">{k}</dt>
                <dd className="display num mt-1 text-[2rem]">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="lg" className="rounded-lg px-5">
              <Link href="/lab/">
                Open the Model Lab <ArrowRightIcon weight="bold" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-lg px-5">
              <Link href="/rankings/bat/">Player ratings</Link>
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
            <span className="eyebrow">Featured match</span>
            <h2 className="display mt-1 text-[1.5rem]">
              {hero.comp.replace(/ \d{4}$/, '')} final: {hero.teams[0]} v {hero.teams[1]}
            </h2>
            <p className="text-[13.5px] text-ink-3">
              {fmt.date(hero.date)}. {hero.teams[0]}’s modelled chance of winning before every ball; shaded bands are pressure balls.
            </p>
          </div>
          <span className="num rounded-md border border-line bg-panel-2 px-2.5 py-1 text-[12.5px] text-ink-2">
            {i1.runs}/{i1.wkts} v {i2.runs}/{i2.wkts}
          </span>
        </div>
        <Zoomable label="match win probability">
          <WinWorm
            worm={worm(hero)}
            animate
            height={300}
            sides={{ up: hero.teams[0], down: hero.teams[1] }}
            labels={{ first: `${hero.teams[0]} batting`, second: `${hero.teams[1]} batting` }}
          />
        </Zoomable>
        <div className="flex flex-wrap items-center justify-between gap-3 text-[13.5px] text-ink-2">
          <p>
            <b className="text-foreground">{hero.result}.</b> Biggest single swing: {big.striker} v {big.bowler} at {big.over} ({big.outcome === 'W' ? 'wicket' : `${big.outcome} runs`}),{' '}
            {fmt.signed(Math.abs(big.wpa) * 100, 0)} points of win probability.
          </p>
          <Link href={`/matches/?id=${hero.id}`} className="font-semibold text-signal-ink hover:underline">
            Explore ball by ball
          </Link>
        </div>
      </section>

      <div className="xl:col-span-4 xl:row-span-2">
        <TopTen bat={bat.slice(0, 10).map((p) => lite(p, 'bat'))} bowl={bowl.slice(0, 10).map((p) => lite(p, 'bowl'))} />
      </div>

      <section className="panel flex flex-col gap-4 p-5 sm:p-6 xl:col-span-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="eyebrow">The pipeline</span>
            <h2 className="display mt-1 text-[1.5rem]">From raw deliveries to validated ratings</h2>
          </div>
          <Link href="/sources/" className="text-[13.5px] font-semibold text-signal-ink hover:underline">
            Data &amp; pipeline
          </Link>
        </div>
        <ol className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-5">
          {steps.map((x) => (
            <li key={x.k} className="flex flex-col gap-2 bg-panel p-4">
              <span className="num text-[12px] text-signal-ink">{x.k}</span>
              <span className="text-[14.5px] font-semibold">{x.t}</span>
              <span className="text-[12.5px] leading-snug text-ink-3">{x.d}</span>
              <span className="num mt-auto pt-1 text-[12.5px] text-data-ink">{x.m}</span>
            </li>
          ))}
        </ol>
        {cmp && (
          <p className="text-[13.5px] text-ink-2">
            The engineered logistic model beat gradient-boosted alternatives on match-grouped cross-validation (chase Brier{' '}
            <b className="num text-foreground">{cmp.logistic.brier.toFixed(4)}</b> vs <span className="num">{cmp.gbm.brier.toFixed(4)}</span>), and it is smooth
            in runs and balls, which is what measuring the stakes of a ball needs.{' '}
            <Link href="/lab/" className="font-semibold text-signal-ink hover:underline">
              See the comparison
            </Link>
          </p>
        )}
      </section>
    </div>
  )
}
