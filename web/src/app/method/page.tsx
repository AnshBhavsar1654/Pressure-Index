import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Flag } from '@/components/Flag'
import { PageHead, SectionHead, Stat, signed } from '@/components/kit'
import { getExample, getGrid, getRanked, getRole, getRR, getSummary } from '@/lib/data'
import { fmt } from '@/lib/format'
import { TERMS, winPts } from '@/lib/terms'
import type { Player, Role } from '@/lib/types'
import { EndgameTable } from '@/views/EndgameTable'
import { CalibrationPair, StabilityPair } from '@/views/MethodCharts'
import { MomentsTable } from '@/views/MomentsTable'
import { ChaseMap, PressureShape } from '@/views/PressureCharts'
import { SanityChecks } from '@/views/SanityChecks'
import { WorkedExample } from '@/views/WorkedExample'

export const metadata: Metadata = { title: 'How it works' }

export default function MethodPage() {
  const s = getSummary()
  const bat = getRole('bat')
  const bowl = getRole('bowl')
  const rr = getRR()
  const ex = getExample()
  const c = s.contrast
  const mo = s.moments[0]
  const e = bat.eligibility

  const steps: { t: string; d: ReactNode; ex: ReactNode }[] = [
    {
      t: 'Who is winning?',
      d: `Before every ball, a model trained on all ${s.n_matches} matches works out each side’s chance of winning from the score, wickets, balls left and target. In the final over of a chase it is worked out exactly, ball by ball, from how often each outcome really happens there.`,
      ex: (
        <>
          {mo.match}, {fmt.date(mo.date)}: <b>{mo.state}</b>. The chasing side’s chance stood at <b>{fmt.pct(mo.wp)}</b>.
        </>
      ),
    },
    {
      t: 'How much is at stake?',
      d: `Imagine every possible next ball (dot, single, four, six, wicket, wide) and measure how far each would move that chance. The average move is the ball’s stakes; a typical ball is 1×. The top 20% of balls by stakes (${s.pressure_threshold.toFixed(2)}× or more) are pressure balls, and so is every ball of a knockout, where losing means going out.`,
      ex: (
        <>
          That last ball carried <b>{mo.li.toFixed(0)}×</b> the stakes of a typical ball. A dead rubber or a chase already won carries
          almost none, however dramatic it looks.
        </>
      ),
    },
    {
      t: 'How well did the player do?',
      d: 'Each ball is judged against an average player in exactly the same spot (same balls left, wickets down, competition and season): runs scored minus the runs an average batter gets from there, with a wicket charged at the runs it costs from that point. Bowlers mirror it: runs saved.',
      ex: (
        <>
          At the death an average batter makes about 1.4 a ball, so a four is worth <b>+2.6</b> and a dot <b>−1.4</b>. Getting out early
          costs about <b>10 runs</b>; in the last overs only about <b>2.6</b>, because there is less left to lose.
        </>
      ),
    },
    {
      t: 'One rating per player',
      d: `Add up the runs added on pressure balls and divide by the balls: runs added per 100 pressure balls. Until a player has a long pressure record, lean on his usual level (the same sum on every other ball): half and half at ${s.K} pressure balls, his own record after that. Each year back counts 20% less.`,
      ex: (
        <>
          {ex.name}: {signed(ex.steps.p_raw100)} per 100 on {ex.steps.p_balls} pressure balls, usual level {signed(ex.steps.n_rv100)}. His record
          is {fmt.pct(ex.steps.share)} of the rating, which comes to <b>{signed(ex.steps.rating100)}</b>.
        </>
      ),
    },
  ]

  // every number on the dashboard, where it comes from
  const sources: [string, string, string][] = [
    ['Chance of winning', 'Model on score, wickets, balls left, target (or par), competition, season; exact in the last over of a chase', 'ball_by_ball: runs, extras, wickets, over and ball; matches: revised overs and target, result'],
    ['Stakes', 'Average move in the chance of winning over every possible next ball, ÷ the average for all balls', 'the chance of winning, and how often each outcome happens in each phase'],
    ['Pressure ball', 'Top 20% of balls by stakes, or any ball of a knockout', 'stakes; matches: stage and knock_out'],
    ['Runs added (one ball)', 'Runs − runs an average player gets from that spot − wicket cost; mirrored for bowlers', 'ball_by_ball: runs, extras, dismissals; an expected-runs table by balls left and wickets lost'],
    ['Pressure rating', `(Σ recency × runs added on pressure balls + ${s.K} × usual level) ÷ (Σ recency + ${s.K}), per 100 balls`, 'runs added on pressure balls; season'],
    ['Usual level', `Σ recency × runs added on other balls ÷ (Σ recency + ${s.K}), per 100 balls`, 'runs added on all other balls'],
    ['Lift', 'Pressure rating − usual level', 'the two above'],
    ['Win impact', 'Change in the chance of winning across the player’s pressure balls, per 100 balls', 'chance of winning before and after each ball'],
    ['Consistency', 'Share of pressure innings or spells (6+ balls) with positive runs added', 'runs added per match'],
    ['Top-10 confidence', 'Share of 400 re-runs on resampled matches in which the player stays top 10', 'the whole ranking, re-run'],
  ]

  const terms: [string, ReactNode][] = (
    ['pressureBall', 'stakes', 'underPressure', 'normal', 'lift', 'winImpact', 'consistency', 'recentForm', 'confidence', 'rankRange', 'rank', 'qualified', 'phase'] as const
  ).map((k) => [TERMS[k].label, TERMS[k].def])

  const pct = (x: number) => `${(x * 100).toFixed(0)}%`

  return (
    <>
      <PageHead
        title="How it works"
        summary={
          <>
            Two questions, asked of every ball since 2022: <b>how much was at stake</b>, and <b>how did the player do compared with an
            average player in the same spot</b>? The answers make one rating per player, set against his own usual level. Four settings
            in all, each one checked against what happened next.
          </>
        }
      />

      {/* ------------------------------------------------------------ the method */}
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
              {st.ex}
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-4 grid gap-3 text-[14.5px] leading-relaxed text-ink-2 md:grid-cols-3 [&_b]:text-ink">
        <p className="panel p-4">
          <b>Who can be ranked.</b> At least {e.min_pressure_balls} pressure balls in {e.min_pressure_matches} matches, {e.min_recent_balls}+ of
          them in {e.recent_from}–26 so every pick is current: {bat.eligibility.n_eligible} batters and {bowl.eligibility.n_eligible} bowlers.
        </p>
        <p className="panel p-4">
          <b>Who can be recommended.</b> Only players RR can buy at the 2027 auction: not RR’s own squad, not players retained by other
          teams or retired, and not Pakistani players. And never a player who <b>dips</b> under pressure (negative lift), however good
          his usual level.
        </p>
        <p className="panel p-4">
          <b>Which cricket.</b> The IPL and T20Is between two full-member nations ({fmt.int(s.n_top_level_matches)} matches). Associate
          T20Is and A-team tournaments are left out, rather than counted at some made-up fraction.
        </p>
      </div>

      {/* ------------------------------------------------------------ 1. pressure definition */}
      <SectionHead title="1. Does the pressure label work?" id="pressure">
        The label was never shown to anything that judges players, yet cricket changes exactly as you would expect when the stakes
        rise. That is how we know it picks out real pressure, not just the last few overs.
      </SectionHead>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <Stat label="Wickets per 100 balls" value={c.pressure.wkt_pct.toFixed(1)} tone="pink" note={`against ${c.normal.wkt_pct.toFixed(1)} in other balls`} />
        <Stat label="Wides and no-balls" value={`${c.pressure.extras_pct.toFixed(1)}%`} tone="pink" note={`against ${c.normal.extras_pct.toFixed(1)}%: bowlers feel it too`} />
        <Stat label="Dot balls" value={`${c.pressure.dot_pct.toFixed(0)}%`} tone="pink" note={`against ${c.normal.dot_pct.toFixed(0)}%`} />
        <Stat label="Pressure balls found" value={fmt.int(c.pressure.balls)} note={`out of ${fmt.int(s.n_balls)} deliveries`} />
      </div>
      <div className="mt-6 flex flex-col gap-6">
        <ChaseMap grid={getGrid()} />
        <PressureShape s={s} />
      </div>

      <SectionHead title="Does it find the right moments?" id="checks">
        A pressure measure is only worth trusting if it agrees with what anyone who watched would say. Known clutch performances and
        the model’s verdict on each, then the biggest match-winning performances it found on its own.
      </SectionHead>
      <SanityChecks pools={{ bat: bat.players, bowl: bowl.players }} />

      <SectionHead title="The tensest balls in five years" id="tensest">
        The single highest-stakes ball of each match. Almost all are last-ball finishes, which is what a pressure measure should find.
      </SectionHead>
      <MomentsTable moments={s.moments} />

      <SectionHead title="The last over, worked out exactly" id="last-over">
        A smooth model is right for most of a match but too gloomy at the very end of a chase: it gave a side needing a boundary off the
        last ball almost no chance. For the final over of a chase the chance is worked out directly, ball by ball, from how often each
        outcome really happens there. That is what lets a last-over finish or defence count as the pressure it is.
      </SectionHead>
      <EndgameTable e={s.wp_model.endgame} />

      {/* ------------------------------------------------------------ 2. measurement */}
      <SectionHead title={`2. Worked example: how ${ex.name} gets to number 1`} id="example">
        Every step done by hand for the top-ranked batter, with the real numbers. Anyone can follow the sums with a calculator, and a
        script checks them against the published rating.
      </SectionHead>
      <WorkedExample e={ex} threshold={s.pressure_threshold} />

      <SectionHead title="Where every number comes from" id="sources">
        Each measure on the dashboard, how it is worked out, and which columns of the data pack it starts from.
      </SectionHead>
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[760px] text-[13.5px]">
          <thead className="text-[12.5px] text-ink-3">
            <tr className="border-b border-line">
              <th className="px-4 py-2.5 text-left font-medium">Measure</th>
              <th className="px-4 py-2.5 text-left font-medium">How it is worked out</th>
              <th className="px-4 py-2.5 text-left font-medium">Built from</th>
            </tr>
          </thead>
          <tbody>
            {sources.map(([m, how, from]) => (
              <tr key={m} className="border-b border-line align-top last:border-0">
                <td className="px-4 py-2.5 font-semibold">{m}</td>
                <td className="px-4 py-2.5 text-ink-2">{how}</td>
                <td className="px-4 py-2.5 text-ink-3">{from}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ------------------------------------------------------------ 3. fair comparisons */}
      <SectionHead title="3. Keeping it fair" id="fair">
        The choices that stop the rankings rewarding the wrong things.
      </SectionHead>
      <ul className="grid gap-3 text-[14.5px] leading-relaxed text-ink-2 md:grid-cols-2 [&_b]:text-ink">
        <li className="panel p-4">
          <b>Small samples.</b> A rating leans on the player’s usual level until his pressure record is long ({s.K} balls for half and
          half). Mitchell Owen made +55 runs per 100 on his first 61 pressure balls; his rating is far lower, because 61 balls prove
          little.
        </li>
        <li className="panel p-4">
          <b>Same situation, same yardstick.</b> Every ball is compared with an average player with the same balls left and wickets in
          hand, in the same competition and season. Thirty off 18 with the tail exposed earns more than forty with the top order intact,
          and the 2024–26 IPL scoring boom flatters nobody.
        </li>
        <li className="panel p-4">
          <b>Batting first, and knockouts.</b> A first-innings ball moves the result less than a chase ball, because the chase is still
          to come, so few first-innings balls clear the line. Every ball of a knockout counts instead, so a big total set in a
          knockout is a pressure performance. Separate lines for each innings were tested and flagged the first two overs almost
          entirely, which is not pressure.
        </li>
        <li className="panel p-4">
          <b>Rain.</b> Reduced matches are judged on their revised overs and target: {s.n_reduced_included} of them count, including the
          2023 IPL final. Only the {s.n_short_excluded} cut below {s.min_match_balls / 6} overs a side are left out of pressure, because a
          five-over slog is a different game.
        </li>
        <li className="panel p-4">
          <b>Economy and wickets both count.</b> A bowler earns every run kept below what an average bowler concedes from the same spot,
          and each wicket at the runs it costs the batting side from there (about 10 in the powerplay, 2.6 at the death).
        </li>
        <li className="panel p-4">
          <b>Built for 2027.</b> 2026 counts in full and each year back 20% less (2025 at 0.8, down to 2022 at 0.2), and every ranked
          player needs {e.min_recent_balls}+ pressure balls in 2025–26.
        </li>
      </ul>

      {/* ------------------------------------------------------------ 4. evidence for the top 10 */}
      <SectionHead
        title="4. The submitted top 10s"
        id="top10"
        action={
          <Link href="/picks/" className="text-[14px] font-semibold text-pink-ink hover:underline">
            Why I back each one
          </Link>
        }
      >
        Ranked by the pressure rating alone, among players RR can buy who rise under pressure. Win impact and consistency are shown as
        evidence, not used to rank.
      </SectionHead>
      <div className="grid gap-4 xl:grid-cols-2">
        {(['bat', 'bowl'] as const).map((role) => (
          <TopTable key={role} role={role} players={getRanked(role).slice(0, 10)} />
        ))}
      </div>

      {/* ------------------------------------------------------------ 5. reliability */}
      <SectionHead title="5. Why it is this simple, and how sure I am" id="reliability">
        The test every choice was made on: build the ratings from earlier seasons only (2022–24, then 2022–25), and see how well they
        predict who actually added runs under pressure the next season (2025, then 2026). 0 means no better than guessing.
      </SectionHead>
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[560px] text-[13.5px]">
          <thead className="text-[12.5px] text-ink-3">
            <tr className="border-b border-line">
              <th className="px-4 py-2.5 text-left font-medium">Ranking players by…</th>
              <th className="px-4 py-2.5 text-right font-medium">Batters</th>
              <th className="px-4 py-2.5 text-right font-medium">Bowlers</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['The pressure rating (this method)', s.forward.bat.rating, s.forward.bowl.rating, true],
                ['Usual level alone', s.forward.bat.normal, s.forward.bowl.normal, false],
                ['Lift alone (rise above usual)', s.forward.bat.lift, s.forward.bowl.lift, false],
                ['Win impact alone', s.forward.bat.wpa100, s.forward.bowl.wpa100, false],
                ['The earlier five-part blend', s.forward_previous.bat, s.forward_previous.bowl, false],
              ] as [string, number, number, boolean][]
            ).map(([label, b, w, me]) => (
              <tr key={label} className="border-b border-line last:border-0">
                <td className={me ? 'px-4 py-2.5 font-semibold' : 'px-4 py-2.5 text-ink-2'}>{label}</td>
                <td className={`num px-4 py-2.5 text-right ${me ? 'font-semibold' : ''}`}>{b.toFixed(2)}</td>
                <td className={`num px-4 py-2.5 text-right ${me ? 'font-semibold' : ''}`}>{w.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-line px-4 py-3 text-[13px] leading-relaxed text-ink-3">
          Correlation between each ranking and the next season’s runs added per pressure ball, pooled over two seasons ({s.forward.bat.n}{' '}
          batters, {s.forward.bowl.n} bowlers with 24+ pressure balls). The earlier blend (30% pressure output, 20% recent form, 20% win
          impact, 15% lift, 15% consistency, with about 25 settings) was replaced because it predicted worse than this one formula.
        </p>
      </div>

      <ul className="mt-5 mb-4 flex max-w-[80ch] flex-col gap-2.5 pl-5 text-[14.5px] leading-relaxed text-ink-2 marker:text-pink [&_b]:text-ink" style={{ listStyle: 'disc' }}>
        <li>
          <b>Bowlers: the rating is the best predictor.</b> It beats both the usual level and the pressure record alone, which is why it
          blends the two.
        </li>
        <li>
          <b>Batters: pressure batting is hard to predict at all.</b> A batter’s usual level is the best guide to how he will bat under
          pressure next season; the pressure record adds little. That is why the rating leans on the usual level until a batter has a
          long pressure record, and why batting ranks below the top few are close calls.
        </li>
        <li>
          <b>“Clutch” is real but small.</b> Lift repeats only weakly between odd and even matches ({bat.split_half.lift.toFixed(2)} for
          batters, {bowl.split_half.lift.toFixed(2)} for bowlers), so it is used as a filter (never recommend a player who dips), not as a
          score to maximise. Win impact and consistency are even noisier, so they are shown as evidence, not blended in.
        </li>
        <li>
          <b>The top of each list is solid; the lower ranks are close calls.</b> The top four batters and bowlers stay in the top 10 in most
          of 400 re-runs; ranks 6 to 10 swap with the next few names. The likely-rank charts below show exactly which.
        </li>
        <li>
          <b>What the data cannot see:</b> fielding, pitch and venue, batter-against-bowler match-ups, injuries, and the ICC T20 World
          Cups and domestic cricket, which the data pack does not include. First-innings pressure is harder to measure than chase
          pressure, so pressure balls lean towards chases.
        </li>
      </ul>

      <div className="flex flex-col gap-3">
        <Details title="Which ranks are safe and which are close calls?">
          <StabilityPair bat={bat.players.filter((p) => p.rank != null).slice(0, 15)} bowl={bowl.players.filter((p) => p.rank != null).slice(0, 15)} />
        </Details>
        <Details title="Is the win-probability model accurate?">
          <CalibrationPair s={s} />
        </Details>
        <Details title="Do the measures repeat from one set of matches to another?">
          <table className="w-full max-w-lg text-[13.5px]">
            <caption className="mb-2 text-left text-[13px] text-ink-3">
              Each measure worked out on odd-numbered and on even-numbered matches: how closely the two halves agree (1 = perfectly).
            </caption>
            <thead className="text-[12.5px] text-ink-3">
              <tr className="border-b border-line">
                <th className="py-2 text-left font-medium">Measure</th>
                <th className="py-2 text-right font-medium">Batters</th>
                <th className="py-2 text-right font-medium">Bowlers</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['rating', 'Pressure rating'],
                  ['normal', 'Usual level'],
                  ['lift', 'Lift'],
                  ['wpa100', 'Win impact'],
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
              Win probability: two logistic models on run-expectancy resources. Chase: log(runs needed ÷ runs still expected from balls and
              wickets left), its interaction with time remaining, required rate and wickets in hand. First innings: log(projected total ÷
              par), par scaled to reduced overs. Validated out-of-fold by match (5-fold grouped). Final over of a chase: exact backward
              recursion over outcome frequencies by required rate and wickets in hand.
            </li>
            <li>
              Stakes = Σ P(outcome | phase) × |ΔWP| over 0, 1, 2, 3, 4, 6, wicket and wide, ÷ its mean. Pressure = top{' '}
              {pct(1 - s.pressure_pctl)} (≥ {s.pressure_threshold.toFixed(2)}) or any knockout ball; matches under {s.min_match_balls / 6}{' '}
              overs a side excluded.
            </li>
            <li>
              Run value: monotonic gradient-boosted run-expectancy model by competition and season, smoothed along balls left. Batter RV =
              bat runs − expected runs − wicket cost; bowler RV mirrors it (byes excluded, run-outs not credited); centred per competition
              and season.
            </li>
            <li>
              Rating: normal = Σw·RV(other) ÷ (Σw + {s.K}); rating = (Σw·RV(pressure) + {s.K}·normal) ÷ (Σw + {s.K}); w = season weight (
              {Object.entries(s.season_weights).map(([y, v]) => `${y} ${v}`).join(', ')}); top-level matches only. Ranked if ≥{' '}
              {e.min_pressure_balls} pressure balls in ≥ {e.min_pressure_matches} matches with ≥ {e.min_recent_balls} in {e.recent_from}–26;
              recommended if signable and rating ≥ normal. 400 match-level bootstrap resamples.
            </li>
            <li>
              Reproduce: <code className="rounded bg-panel-2 px-1">python -I analysis/pipeline.py</code>, then{' '}
              <code className="rounded bg-panel-2 px-1">python -I analysis/rr2026.py</code> and{' '}
              <code className="rounded bg-panel-2 px-1">python analysis/worked_example.py</code>.
            </li>
          </ul>
        </Details>
      </div>

      <SectionHead title="Words used on this dashboard" id="glossary" />
      <dl className="grid gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-2">
        {terms.map(([t, d]) => (
          <div key={t} className="bg-panel px-5 py-3.5">
            <dt className="font-semibold">{t}</dt>
            <dd className="mt-0.5 text-[14px] leading-relaxed text-ink-2">{d}</dd>
          </div>
        ))}
      </dl>

      <SectionHead title="Data sources" id="data">
        The analysis uses only the official SupeRR Selector Season 2 data pack: ball-by-ball records, matches, competitions, playing XIs
        and squad lists for IPL and T20Is from 2022 to 2026. Public information is used for two things only: the IPL 2027 retention
        lists (which players can be bought) and a cross-check of RR’s 2026 figures, where {rr.provenance.checks_passed} of{' '}
        {rr.provenance.checks.length} match exactly.{' '}
        <Link href="/rajasthan/#sources" className="font-semibold text-pink-ink hover:underline">
          See the checks
        </Link>
      </SectionHead>
    </>
  )
}

function TopTable({ role, players }: { role: Role; players: Player[] }) {
  return (
    <div className="panel overflow-x-auto">
      <h3 className="border-b border-line px-4 py-3 text-[15px] font-semibold">{role === 'bat' ? 'Batters' : 'Bowlers'}</h3>
      <table className="w-full min-w-[540px] text-[13px]">
        <thead className="text-[12px] text-ink-3">
          <tr className="border-b border-line">
            <th className="px-3 py-2 text-left font-medium">#</th>
            <th className="py-2 text-left font-medium">Player</th>
            <th className="py-2 text-right font-medium">Rating</th>
            <th className="py-2 text-right font-medium">Usual</th>
            <th className="py-2 text-right font-medium">Lift</th>
            <th className="py-2 text-right font-medium">Win impact</th>
            <th className="py-2 text-right font-medium">Balls</th>
            <th className="px-3 py-2 text-right font-medium">Top 10</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.id} className="border-b border-line last:border-0">
              <td className="display num px-3 py-2 text-[1.1rem] text-pink">{p.rank}</td>
              <td className="py-2">
                <span className="flex items-center gap-2">
                  <Flag country={p.country} size={16} />
                  <Link href={`/players/${role}/${p.id}/`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                </span>
              </td>
              <td className="num py-2 text-right font-semibold">{signed(p.p_rv100)}</td>
              <td className="num py-2 text-right text-ink-2">{signed(p.n_rv100)}</td>
              <td className="num py-2 text-right text-pink-ink">{signed(p.delta100)}</td>
              <td className="num py-2 text-right">{winPts(p.wpa100)}</td>
              <td className="num py-2 text-right">{p.p_balls}</td>
              <td className="num px-3 py-2 text-right">{fmt.pct(p.boot?.p_top10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
