import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { PageHead, SectionHead } from '@/components/ui'
import { getRole, getRR, getSummary } from '@/lib/data'
import { fmt } from '@/lib/format'
import { CalibrationPair, ShrinkCurve, StabilityPair } from '@/views/MethodCharts'

export const metadata: Metadata = { title: 'The method in plain words' }

export default function MethodPage() {
  const s = getSummary()
  const bat = getRole('bat')
  const bowl = getRole('bowl')
  const rr = getRR()
  const mo = s.moments[0]
  const w = s.weights
  const pct = (x: number) => `${Math.round(x * 100)}%`

  const steps: { t: string; d: ReactNode; e: ReactNode }[] = [
    {
      t: 'Find the moments that matter',
      d: 'A win-probability model reads the scoreboard before every ball. We ask how much the next ball could move it. The 20% of balls that could move it most are pressure moments.',
      e: (
        <>
          {mo.match}, {fmt.date(mo.date)}: <b>{mo.state}</b>. The chasing side’s chance stood at {fmt.pct(mo.wp)}, and one ball
          could win or lose it. That ball carried <b>{mo.li.toFixed(0)} times</b> the stakes of a typical delivery.
        </>
      ),
    },
    {
      t: 'Judge each ball against the situation',
      d: 'A single off the last ball and a single in the fifth over are not worth the same. We compare what happened with what an average player gets from the same overs left and wickets down, and charge each wicket at the runs it costs from there.',
      e: (
        <>
          At the death an average batter makes about 1.4 runs a ball. A four is worth <b>+2.6</b>; a dot is <b>−1.4</b>. Getting
          out early in the innings costs around <b>10 runs</b>, but only about <b>2.6</b> in the last overs, because there is
          less left to lose.
        </>
      ),
    },
    {
      t: 'Compare players fairly',
      d: 'Players are measured in pressure moments and in ordinary moments, so we can see who rises and who fades. Results are weighted for the strength of the competition and how recent they are, and small samples are treated with caution.',
      e: (
        <>
          A batter with 120 brilliant pressure balls is pulled partway back towards their normal level. One with 500 brilliant
          balls keeps most of the credit. One great month should not beat four great seasons.
        </>
      ),
    },
    {
      t: 'Blend four ingredients and stress-test',
      d: `The rating is ${pct(w.pressure)} output under pressure, ${pct(w.impact)} match-winning impact, ${pct(w.delta)} rise above their own normal and ${pct(w.consistency)} consistency. Then we re-run the whole ranking 400 times on reshuffled matches to see which ranks are solid.`,
      e: (
        <>
          A player who stays in the top 10 in 380 of 400 re-runs is a safe pick. One who makes it in 120 is a close call, and the
          dashboard says so.
        </>
      ),
    },
  ]

  const terms: [string, ReactNode][] = [
    ['Pressure moment', 'One of the 20% of balls where the next delivery could change the result the most.'],
    ['Stakes', 'How much the next ball can move a team’s chance of winning, compared with a typical ball (1.0). Also called the leverage index.'],
    ['Win probability', 'The chance a team wins from the current score, wickets, balls left and target, learned from 867 real matches.'],
    ['Runs added', 'Runs scored (or saved, for bowlers) above what an average player would manage in exactly the same situation. 0 is average.'],
    ['Per 100 balls', 'Runs added scaled to 100 balls, so players with different workloads can be compared.'],
    ['Match-winning impact', 'How much a player’s pressure balls raised (or lowered) their team’s chance of winning.'],
    ['Rise above own normal', 'Their level in pressure moments minus their level in ordinary moments. Positive means they rise to the occasion.'],
    ['Consistency', 'Share of their pressure innings or spells (6 balls or more) that beat the average.'],
    ['Stays top 10', 'How often the player is still top 10 when we re-run everything 400 times on reshuffled matches.'],
    ['Phase', 'Powerplay is overs 1 to 6, the middle overs are 7 to 15, and the death is overs 16 to 20.'],
  ]

  return (
    <>
      <PageHead
        title="The method in plain words"
        takeaway="Three questions, asked of every ball since 2022: how much was at stake, how well did the player do given the situation, and does it hold up across many matches?"
      />

      <ol className="flex flex-col gap-px overflow-hidden rounded-[10px] border border-line bg-line">
        {steps.map((st, i) => (
          <li key={st.t} className="grid gap-4 bg-panel p-5 md:grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1fr)] md:gap-6">
            <span className="display num text-[3rem] leading-none text-pink">{i + 1}</span>
            <div>
              <h2 className="text-[17px] font-semibold">{st.t}</h2>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2">{st.d}</p>
            </div>
            <p className="rounded-lg bg-panel-2 px-4 py-3 text-[14px] leading-relaxed text-ink-2 [&_b]:text-ink">
              <span className="mb-1 block text-[12.5px] font-semibold text-blue">Example</span>
              {st.e}
            </p>
          </li>
        ))}
      </ol>

      <SectionHead title="Words used on this dashboard" />
      <dl className="grid gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-2">
        {terms.map(([t, d]) => (
          <div key={t} className="bg-panel px-5 py-3.5">
            <dt className="font-semibold">{t}</dt>
            <dd className="mt-0.5 text-[14px] leading-relaxed text-ink-2">{d}</dd>
          </div>
        ))}
      </dl>

      <SectionHead title="Keeping it fair">These choices stop the rankings from rewarding the wrong things.</SectionHead>
      <ul className="grid gap-3 text-[14.5px] leading-relaxed text-ink-2 md:grid-cols-2 [&_b]:text-ink">
        <li className="panel p-4">
          <b>Enough evidence.</b> At least {bat.eligibility.min_pressure_balls} pressure balls across {bat.eligibility.min_pressure_matches}{' '}
          matches: {bat.eligibility.n_eligible} batters and {bowl.eligibility.n_eligible} bowlers qualify.
        </li>
        <li className="panel p-4">
          <b>Era-aware.</b> Scoring jumped in the 2024 to 2026 IPL. Every comparison is made within the same competition and season,
          so recent batters are not flattered and recent bowlers are not punished.
        </li>
        <li className="panel p-4">
          <b>Opposition strength.</b> IPL and matches between full-member nations count fully, games against associate nations
          count 75%, and emerging-team tournaments 60%.
        </li>
        <li className="panel p-4">
          <b>Built for 2027.</b> Recent form matters more for an auction: 2026 counts fully, then 90%, 80%, 70% and 60% going
          back to 2022.
        </li>
      </ul>

      <SectionHead title="How sure are we?">
        Honest answers, with the evidence one click away.
      </SectionHead>
      <ul className="mb-4 flex max-w-[78ch] flex-col gap-2.5 pl-5 text-[14.5px] leading-relaxed text-ink-2 marker:text-pink [&_b]:text-ink" style={{ listStyle: 'disc' }}>
        <li>
          <b>The pressure definition is solid.</b> The win-probability model is well calibrated, and pressure moments really do
          play differently: more wickets, more wides and no-balls, more dot balls.
        </li>
        <li>
          <b>The top of each list is robust; ranks 8 to 14 are close calls.</b> The likely-rank charts show which positions would
          survive a different sample of matches.
        </li>
        <li>
          <b>“Clutch” is real but small.</b> As in every sport that has studied it, a player’s normal quality is the best guide to
          their pressure output. That is why output under pressure carries the most weight, and the rise above normal acts more
          as a tie-breaker.
        </li>
        <li>
          <b>What the data cannot see:</b> fielding, pitch and venue, specific batter-against-bowler match-ups, and injuries.
          First-innings pressure is harder to measure than chase pressure, so pressure moments lean towards chases.
        </li>
      </ul>

      <div className="flex flex-col gap-3">
        <Details title="Is the win-probability model accurate?">
          <CalibrationPair s={s} />
        </Details>
        <Details title="Which ranks are safe and which are close calls?">
          <StabilityPair bat={bat.players.slice(0, 15)} bowl={bowl.players.slice(0, 15)} />
        </Details>
        <Details title="How much should a pressure record be trusted?">
          <ShrinkCurve bat={bat} bowl={bowl} />
          <table className="mt-4 w-full max-w-lg text-[13.5px]">
            <caption className="mb-2 text-left text-[13px] text-ink-3">
              Same measure on odd-numbered and even-numbered matches: how closely the two halves agree (1 = perfectly).
            </caption>
            <thead className="text-[12.5px] text-ink-3">
              <tr className="border-b border-line">
                <th className="py-2 text-left font-medium">Ingredient</th>
                <th className="py-2 text-right font-medium">Batters</th>
                <th className="py-2 text-right font-medium">Bowlers</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['n_rv', 'Normal level'],
                  ['p_rv', 'Output under pressure'],
                  ['wpa100', 'Match-winning impact'],
                  ['delta', 'Rise above own normal'],
                  ['cons', 'Consistency'],
                ] as const
              ).map(([k, l]) => (
                <tr key={k} className="border-b border-line last:border-0">
                  <td className="py-2 text-ink-2">{l}</td>
                  <td className="num py-2 text-right">{bat.split_half[k].toFixed(2)}</td>
                  <td className="num py-2 text-right">{bowl.split_half[k].toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Details>
        <Details title="Technical summary for analysts">
          <ul className="flex flex-col gap-2 pl-5 text-[14px] leading-relaxed text-ink-2" style={{ listStyle: 'disc' }}>
            <li>
              Win probability: two logistic models on run-expectancy resources. Chase: log(runs needed ÷ runs still expected from
              balls and wickets left), its interaction with time remaining, required rate and wickets in hand. First innings:
              log(projected total ÷ season par). Validated out-of-fold by match (5-fold grouped).
            </li>
            <li>
              Leverage index = Σ P(outcome | phase) × |ΔWP| over 0, 1, 2, 3, 4, 6, wicket and wide, divided by its mean. Knockouts
              ×{s.knockout_mult}. Pressure = top 20% (index ≥ {s.pressure_threshold.toFixed(2)}).
            </li>
            <li>
              Run value: monotonic gradient-boosted run-expectancy model by competition and season, smoothed along balls left.
              Batter RV = bat runs − expected runs − wicket cost; bowler RV mirrors it (byes excluded, run-outs not credited).
            </li>
            <li>
              Rating: baseline shrunk to the league mean (prior chosen by cross-validation); pressure lift against the player’s own
              baseline shrunk towards zero (prior {bat.k.kp} balls); z-scored components blended {pct(w.pressure)} / {pct(w.impact)} /{' '}
              {pct(w.delta)} / {pct(w.consistency)}; 400 match-level bootstrap resamples.
            </li>
            <li>
              Reproduce everything: <code className="rounded bg-panel-2 px-1">python -I analysis/pipeline.py</code> then{' '}
              <code className="rounded bg-panel-2 px-1">python -I analysis/rr2026.py</code>.
            </li>
          </ul>
        </Details>
      </div>

      <SectionHead title="Data sources">
        Only the official SupeRR Selector Season 2 data pack is used for the analysis: ball-by-ball records, matches, competitions,
        playing XIs, and squad lists for IPL and T20Is from 2022 to 2026. The RR 2026 figures were cross-checked against the public
        record: {rr.provenance.checks_passed} of {rr.provenance.checks.length} match exactly.{' '}
        <Link href="/rajasthan/#sources" className="font-semibold text-pink-ink hover:underline">
          See the checks
        </Link>
      </SectionHead>
    </>
  )
}

function Details({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="panel group">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-[15px] font-semibold">
        {title}
        <span className="text-[13px] font-medium text-pink-ink group-open:hidden">Show evidence</span>
        <span className="hidden text-[13px] font-medium text-ink-3 group-open:inline">Hide</span>
      </summary>
      <div className="border-t border-line p-5">{children}</div>
    </details>
  )
}
