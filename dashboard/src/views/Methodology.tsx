import type { ReactNode } from 'react'
import { ChartFrame, Legend } from '../components/charts/core'
import { LineChart } from '../components/charts/LineChart'
import { Calibration, RankRanges } from '../components/charts/Profile'
import type { AppData, ScoredPlayer } from '../lib/data'

export function Methodology({ data, bat, bowl }: { data: AppData; bat: ScoredPlayer[]; bowl: ScoredPlayer[] }) {
  const s = data.summary
  const wp1 = s.wp_model['1']
  const wp2 = s.wp_model['2']
  const cv = (['bat', 'bowl'] as const).map((r) => ({
    key: r,
    label: r === 'bat' ? 'Batters' : 'Bowlers',
    color: r === 'bat' ? 'var(--pink)' : 'var(--blue)',
    points: Object.entries(data[r].k.cv_p).map(([k, v]) => ({ x: Math.log10(Number(k)), y: v })),
  }))
  const sh = [
    { key: 'n_rv', label: 'Baseline run value' },
    { key: 'p_rv', label: 'Pressure run value' },
    { key: 'wpa100', label: 'Win probability added' },
    { key: 'delta', label: 'Lift over baseline' },
    { key: 'cons', label: 'Consistency' },
  ]

  return (
    <article className="flex flex-col gap-8">
      <header className="flex max-w-[78ch] flex-col gap-3">
        <p className="eyebrow">Methodology report</p>
        <h1 className="display text-[2.3rem] font-bold leading-none">How the rankings were built</h1>
        <p className="text-[14.5px] leading-relaxed text-ink-2">
          Everything here is reproducible from the supplied data with one script (<code>analysis/pipeline.py</code>). The
          five sections follow the brief: pressure definition, performance measurement, fair comparisons, evidence, and
          reliability.
        </p>
      </header>

      <Section n="01" title="Pressure definition">
        <p>
          Pressure is defined as <b>leverage</b>: how much the next delivery can move the batting side’s probability of
          winning. It responds to every signal the brief lists at once (required rate, wickets in hand, balls remaining,
          stage of the innings, closeness) because they all feed the win-probability model, and it correctly treats lost
          causes and walkovers as low pressure.
        </p>
        <ul>
          <li>
            <b>Win-probability model.</b> Two monotonic gradient-boosted classifiers (first innings: runs, balls left,
            wickets in hand; chase: runs needed, balls left, wickets in hand, required rate), each also given competition and
            season. Out-of-fold by match (5-fold grouped), then isotonic-calibrated. Chase AUC {wp2.auc}, Brier{' '}
            {wp2.brier}. First innings AUC {wp1.auc}, Brier {wp1.brier}. The first innings is inherently harder to call before
            a target exists.
          </li>
          <li>
            <b>Leverage Index.</b> LI = Σ P(outcome | phase) × |WP(after outcome) − WP(now)|, divided by its mean across all
            deliveries. Outcomes: 0, 1, 2, 3, 4, 6, wicket, wide. End-of-first-innings states are valued by the chase model
            at the start of the reply, so both innings share one scale.
          </li>
          <li>
            <b>Pressure Index and threshold.</b> LI × {s.knockout_mult} for knockout matches. High pressure = top{' '}
            {Math.round((1 - s.pressure_pctl) * 100)}% (Index ≥ {s.pressure_threshold.toFixed(2)}). Reduced-overs matches use
            the revised overs and DLS target. Super overs are excluded.
          </li>
        </ul>
        <div className="grid gap-4 sm:grid-cols-2">
          <ChartFrame title="Chase model calibration" subtitle="Predicted vs actual win rate, held-out matches.">
            <Calibration bins={wp2.calibration} />
          </ChartFrame>
          <ChartFrame title="First-innings model calibration" subtitle="Predicted vs actual win rate, held-out matches.">
            <Calibration bins={wp1.calibration} />
          </ChartFrame>
        </div>
      </Section>

      <Section n="02" title="Performance measurement">
        <p>
          The common currency is <b>run value (RV)</b>: runs added relative to what an average player produces from the
          same state. A run-expectancy model (monotonic gradient boosting on completed first innings, by competition and
          season) gives the runs still to come from any (balls left, wickets down) state. For each ball:
        </p>
        <ul>
          <li>
            <b>Batter RV</b> = runs off the bat − expected runs for that ball − (wicket cost if the striker is dismissed).
            Wides are not balls faced. A wicket costs ~10.5 runs in the powerplay, ~7 in the middle overs and ~2.6 at the
            death, because a wicket late in the innings takes away less.
          </li>
          <li>
            <b>Bowler RV</b> = expected runs − runs conceded (bat runs, wides, no-balls; not byes) + wicket cost for wickets
            credited to the bowler (run-outs excluded).
          </li>
          <li>
            <b>Win probability added (WPA)</b> is the actual change in WP on each ball, credited to the batter (and against
            the bowler). It rewards finishing the job, which RV alone cannot see.
          </li>
        </ul>
        <p>
          <b>Rating.</b> For each player: baseline level (RV per ordinary ball, shrunk toward the league mean), clutch lift
          (pressure RV minus the player’s own baseline, shrunk toward zero with a prior worth {data.bat.k.kp} pressure balls),
          pressure level = baseline + lift, WPA per 100 pressure balls, and consistency (share of matches with 6+ pressure
          balls that finished above expectation, Beta-smoothed). The four components are standardised among eligible
          players and blended {Math.round(s.weights.pressure * 100)} / {Math.round(s.weights.impact * 100)} /{' '}
          {Math.round(s.weights.delta * 100)} / {Math.round(s.weights.consistency * 100)} (pressure level / WPA / lift /
          consistency).
        </p>
      </Section>

      <Section n="03" title="Fair comparisons">
        <ul>
          <li>
            <b>Eligibility.</b> At least {data.bat.eligibility.min_pressure_balls} high-pressure balls and{' '}
            {data.bat.eligibility.min_pressure_matches} matches with pressure exposure: {data.bat.eligibility.n_eligible}{' '}
            batters and {data.bowl.eligibility.n_eligible} bowlers qualify.
          </li>
          <li>
            <b>Context.</b> Expected runs and win probability are conditioned on competition and season, so the 2024 to 2026
            IPL scoring surge (impact-player era) does not inflate recent batters or punish recent bowlers.
          </li>
          <li>
            <b>Competition strength.</b> Ball weights: IPL and full-member T20Is 1.0, T20Is involving an associate 0.75,
            emerging-teams tournaments 0.6.
          </li>
          <li>
            <b>Recency.</b> This is a 2027 auction question, so seasons are weighted 2022 → 2026 as{' '}
            {Object.values(s.season_weights).join(' / ')}.
          </li>
          <li>
            <b>Sample size.</b> Empirical-Bayes shrinkage pulls small samples toward a prior, so a hot 120-ball run cannot
            outrank a sustained 500-ball record. The baseline prior strength was chosen by cross-validation (odd vs even
            matches).
          </li>
        </ul>
      </Section>

      <Section n="04" title="Evidence for the top 10">
        <p>
          Rank stability comes from 400 bootstrap resamples of whole matches. The dot is the median rank, the bar the 90%
          interval. Players whose interval sits inside the shaded zone are robust selections. Wider bars near rank 10 mark
          the genuinely close calls.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartFrame title="Batters: bootstrap rank intervals">
            <RankRanges players={bat} />
          </ChartFrame>
          <ChartFrame title="Bowlers: bootstrap rank intervals">
            <RankRanges players={bowl} />
          </ChartFrame>
        </div>
      </Section>

      <Section n="05" title="Reliability and limitations">
        <p>
          Split-half reliability: each component is computed separately on odd- and even-numbered matches, and the table shows how
          well the two halves agree across eligible players (Pearson r).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full max-w-xl text-[13.5px]">
            <thead className="text-[11px] uppercase tracking-wider text-ink-3">
              <tr className="border-b border-line">
                <th className="py-2 text-left font-medium">Component</th>
                <th className="py-2 text-right font-medium">Batters r</th>
                <th className="py-2 text-right font-medium">Bowlers r</th>
              </tr>
            </thead>
            <tbody>
              {sh.map((r) => (
                <tr key={r.key} className="border-b border-line last:border-0">
                  <td className="py-2 text-ink-2">{r.label}</td>
                  <td className="num py-2 text-right">{data.bat.split_half[r.key]?.toFixed(2)}</td>
                  <td className="num py-2 text-right">{data.bowl.split_half[r.key]?.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ChartFrame
          title="How much should pressure records be trusted?"
          subtitle="Out-of-sample error when predicting a player's pressure run value in the other half of matches, for different prior strengths. Lower is better. A curve that keeps falling to the right means the best forecast leans on the player's overall level."
          legend={<Legend items={cv.map((c) => ({ label: c.label, color: c.color, shape: 'line' }))} />}
        >
          <LineChart
            series={cv}
            xLabel="Prior strength (pressure balls, log scale)"
            yLabel="Weighted squared error"
            xTicks={[25, 100, 400, 1600].map((v) => Math.log10(v))}
            xFormat={(v) => String(Math.round(10 ** v))}
            yFormat={(v) => v.toFixed(3)}
            showPoints
            height={240}
          />
        </ChartFrame>
        <ul>
          <li>
            <b>Clutch skill is small and noisy, as in every sport that has studied it.</b> Cross-validation prefers a prior
            of {data.bat.k.kp_cv} balls for batters and {data.bowl.k.kp_cv} for bowlers. Most of what predicts future
            pressure output is a player’s overall quality. That is why pressure level (baseline plus shrunk lift) carries
            the largest weight, and lift and consistency act as tie-breakers rather than drivers.
          </li>
          <li>
            The rankings describe who <i>has delivered</i> under pressure from 2022 to 2026, with a deliberately lighter
            prior ({data.bat.k.kp} balls) than the pure forecasting optimum. Treat close calls around ranks 8 to 14 as
            interchangeable within the uncertainty shown above.
          </li>
          <li>
            No fielding, ball-tracking, venue or matchup adjustment. Openers face less chase pressure by role. Bowling
            consistency is measured per spell, so bowlers used for one over at a time have fewer qualifying spells.
          </li>
          <li>
            First-innings win probability is weaker (AUC {wp1.auc}), so first-innings leverage is less precise than in the
            chase.
          </li>
        </ul>
      </Section>
    </article>
  )
}

function Section({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-line-strong pt-6 lg:grid-cols-[12rem_1fr]">
      <div className="flex items-baseline gap-3 lg:flex-col lg:gap-1">
        <span className="display num text-[2.2rem] font-bold leading-none text-pink">{n}</span>
        <h2 className="display text-[1.5rem] font-semibold leading-tight">{title}</h2>
      </div>
      <div className="prose-rr flex max-w-[82ch] flex-col gap-4 text-[14px] leading-relaxed text-ink-2 [&_b]:text-ink [&_code]:rounded-[2px] [&_code]:bg-surface-2 [&_code]:px-1 [&_li]:pl-1 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  )
}
