import Link from 'next/link'
import { WinWorm } from '@/components/charts/WinWorm'
import { Zoomable } from '@/components/charts/Zoom'
import { MatchScore } from '@/components/MatchScore'
import { getLab, getMatchDetail, getMatches, getRanked, getSummary } from '@/lib/data'
import { fmt } from '@/lib/format'
import type { Player, Role } from '@/lib/types'
import { TopTen, type RankedPlayer } from '@/views/OverviewCards'

const rankedPlayer = (p: Player, role: Role): RankedPlayer => ({
  id: p.id,
  name: p.name,
  rank: p.rank ?? 0,
  country: p.country,
  rating: p.p_rv100,
  confidence: p.boot?.p_top10 ?? 0,
  rate: role === 'bat' ? (p.press.sr ?? null) : (p.press.econ ?? null),
})

export default function Overview() {
  const summary = getSummary()
  const finals = getMatches().filter((match) => match.stage === 'Final').toSorted((a, b) => b.drama - a.drama)
  const featured = finals.find((match) => match.comp.includes('World Cup')) ?? finals[0]
  const match = getMatchDetail(featured.id)
  const swing = match.swings[0]
  const gainingTeam = swing && (swing.wpa >= 0 ? swing.bat_team : match.teams.find((team) => team !== swing.bat_team))
  const swingIndex = swing ? match.balls.findIndex(
    (ball) => ball[0] === swing.inn && ball[1] === swing.over && match.people[ball[6]] === swing.striker,
  ) : -1
  const worm = match.balls.map((ball, i) => [i, ball[2], ball[4], ball[0]] as [number, number, number, number])
  const comparison = getLab().wp_comparison?.innings['2'].cv
  const metrics = [
    ['Matches', fmt.int(summary.n_matches)],
    ['Deliveries', fmt.int(summary.n_balls)],
    ['Pressure balls', fmt.int(summary.contrast.pressure.balls)],
    ['Chase model AUC', summary.wp_model['2'].auc.toFixed(3)],
  ]
  const pipeline = [
    ['Match data', 'Standardise IPL and T20I deliveries from Cricsheet.'],
    ['Run expectancy', 'Estimate runs remaining from each match state.'],
    ['Win probability', 'Model both innings and calculate final-over chases ball by ball.'],
    ['Player ratings', 'Measure runs added or saved on pressure balls.'],
    ['Validation', 'Test across matches and seasons, and bootstrap ranking uncertainty.'],
  ]

  return (
    <div className="space-y-8">
      <header className="border-b border-line pb-4">
        <h1 className="display text-4xl sm:text-[3.5rem]">T20 under pressure</h1>
        <p className="mt-2 text-base text-ink-2">Ball-by-ball win probability and player ratings for the IPL and men’s T20Is.</p>
      </header>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,0.43fr)] xl:items-start">
        <section className="min-w-0 border-t-2 border-ink bg-panel" aria-labelledby="featured-title">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4 sm:px-5">
            <h2 id="featured-title" className="display text-xl sm:text-2xl">Featured match</h2>
            <time dateTime={match.date} className="text-sm text-ink-3">{fmt.date(match.date)}</time>
          </div>
          <MatchScore match={match} className="px-4 pb-4 pt-2 sm:px-5" />
          <div className="border-y border-line px-3 py-3 sm:px-5">
            <Zoomable label="match win probability" heading={<h3 className="text-base font-semibold">Win probability</h3>}>
              <WinWorm
                worm={worm}
                teams={match.teams}
                height={252}
                highlight={swingIndex}
              />
            </Zoomable>
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
            {swing && (
              <div className="flex items-start gap-3 border-l-4 border-[var(--pressure-highlight)] pl-3">
                <span className="num shrink-0 text-lg font-semibold text-ink">
                  {fmt.signed(Math.abs(swing.wpa) * 100, 0)} pp
                </span>
                <p className="text-sm text-ink-2">
                  <strong className="block font-semibold text-foreground">Biggest swing{gainingTeam && ` for ${gainingTeam}`}</strong>
                  {swing.striker} v {swing.bowler}, over {swing.over}
                </p>
              </div>
            )}
            <Link href={`/matches/?id=${match.id}`} className="inline-flex min-h-10 shrink-0 items-center text-sm font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
              Explore ball by ball
            </Link>
          </footer>
        </section>

        <TopTen bat={getRanked('bat').slice(0, 10).map((p) => rankedPlayer(p, 'bat'))} bowl={getRanked('bowl').slice(0, 10).map((p) => rankedPlayer(p, 'bowl'))} />
      </div>

      <section aria-labelledby="coverage-title" className="border-t border-line pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="coverage-title" className="display text-xl">Dataset coverage</h2>
          <p className="text-sm text-ink-3">IPL and men’s T20Is, {summary.seasons[0]}-{summary.seasons.at(-1)}</p>
        </div>
        <dl className="mt-3 grid grid-cols-2 border-y border-line sm:grid-cols-4">
          {metrics.map(([label, value], i) => (
            <div key={label} className={`py-3 even:border-l even:border-line even:pl-4 ${i > 0 ? 'sm:border-l sm:border-line sm:pl-5' : ''}`}>
              <dt className="text-sm text-ink-3">{label}</dt>
              <dd className="num text-2xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="pipeline-title" className="border-t border-line pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 id="pipeline-title" className="display text-2xl">How the ratings are built</h2>
          <Link href="/sources/" className="text-sm font-semibold text-signal-ink underline-offset-4 hover:underline">Data &amp; pipeline</Link>
        </div>
        <ol className="mt-4 grid divide-y divide-line border-y border-line lg:grid-cols-5 lg:divide-x lg:divide-y-0">
          {pipeline.map(([title, description]) => (
            <li key={title} className="py-3 lg:px-4 lg:first:pl-0">
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="mt-1 text-sm leading-snug text-ink-2">{description}</p>
            </li>
          ))}
        </ol>
        {comparison && (
          <p className="mt-4 max-w-[70ch] text-sm text-ink-2">
            The logistic chase model scored <strong className="num font-medium">{comparison.logistic.brier.toFixed(4)}</strong> on Brier loss in
            match-grouped cross-validation, compared with <strong className="num font-medium">{comparison.gbm.brier.toFixed(4)}</strong> for gradient boosting.{' '}
            <Link href="/lab/" className="font-semibold underline underline-offset-4">Model Lab</Link>
          </p>
        )}
      </section>
    </div>
  )
}
