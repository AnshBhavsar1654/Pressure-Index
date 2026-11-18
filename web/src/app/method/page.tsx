import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Flag } from '@/components/Flag'
import { Bullets, PageHead, SectionHead, Stat, signed } from '@/components/kit'
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

const CONTENTS: [string, string][] = [
  ['steps', 'The method in 4 steps'],
  ['pressure', '1. What counts as pressure'],
  ['measure', '2. Measuring performance'],
  ['fair', '3. Fair comparisons'],
  ['top10', '4. Evidence for the top 10'],
  ['reliability', '5. Reliability and limits'],
  ['settings', 'Every number chosen'],
  ['glossary', 'Glossary'],
]

export default function MethodPage() {
  const s = getSummary()
  const bat = getRole('bat')
  const bowl = getRole('bowl')
  const rr = getRR()
  const ex = getExample()
  const c = s.contrast
  const mo = s.moments[0]
  const e = bat.eligibility
  const weights = Object.entries(s.season_weights).map(([y, v]) => `${y}: ${v}`).join(' · ')
  // the small-sample example on this page is read from the data, never typed in
  const owen = bat.players.find((p) => p.name === 'Mitchell Owen')

  const steps: { t: string; d: ReactNode[]; ex: ReactNode }[] = [
    {
      t: 'Who is winning?',
      d: [
        `A model trained on all ${s.n_matches} matches gives each side’s chance of winning before every ball`,
        'It reads the score, wickets, balls left and the target',
        'In the final over of a chase the chance is worked out exactly, ball by ball',
      ],
      ex: (
        <>
          {mo.match}, {fmt.date(mo.date)}: <b>{mo.state}</b>. The chasing side’s chance: <b>{fmt.pct(mo.wp)}</b>.
        </>
      ),
    },
    {
      t: 'How much is at stake?',
      d: [
        'Picture every possible next ball: dot, single, four, six, wicket, wide',
        'Stakes = how far that ball could move the chance of winning (a typical ball is 1×)',
        <>
          <b>Pressure ball</b> = the top 20% by stakes ({s.pressure_threshold.toFixed(2)}× or more), plus every ball of a knockout
        </>,
      ],
      ex: (
        <>
          That ball carried <b>{mo.li.toFixed(0)}×</b> the stakes of a typical ball. A chase already won carries almost none.
        </>
      ),
    },
    {
      t: 'How well did the player do?',
      d: [
        <>
          <b>Runs added</b> = runs scored − what an average batter scores from the same spot
        </>,
        'A wicket is charged at the runs it costs from that spot',
        'Bowlers mirror it: runs saved',
        'T20Is are also compared within the same host country and opponent each season',
      ],
      ex: (
        <>
          At the death an average batter makes about 1.5 a ball, so a four is worth <b>+2.5</b> and a dot <b>−1.5</b>. A wicket in the
          powerplay costs about <b>10 runs</b>; at the death about <b>2.6</b>.
        </>
      ),
    },
    {
      t: 'One rating per player',
      d: [
        <>
          <b>Pressure rating</b> = runs added per 100 pressure balls
        </>,
        <>A short record leans on the player’s usual level; half and half at {s.K} pressure balls</>,
        'Each year back counts 20% less',
        <>
          <b>Lift</b> = rating − usual level: does he rise or dip?
        </>,
      ],
      ex: (
        <>
          {ex.name}: {signed(ex.steps.p_raw100)} on his pressure balls, usual level {signed(ex.steps.n_rv100)}. His record is{' '}
          {fmt.pct(ex.steps.share)} of the rating, which comes to <b>{signed(ex.steps.rating100)}</b>.
        </>
      ),
    },
  ]

  // every measure on the dashboard, where it comes from
  const sources: [string, string, string][] = [
    ['Chance of winning', 'Model on score, wickets, balls left, target (or par), competition and season; exact in the last over of a chase', 'ball_by_ball; matches (revised overs and target, result)'],
    ['Stakes', 'Average move in the chance of winning over every possible next ball, ÷ the average for all balls', 'the chance of winning; how often each outcome happens in each phase'],
    ['Pressure ball', 'Top 20% of balls by stakes, or any knockout ball', 'stakes; matches (stage, knock_out)'],
    ['Runs added (one ball)', 'Runs − expected runs from that spot − wicket cost; mirrored for bowlers; T20Is recentred by host country and opponent each season', 'ball_by_ball; matches (venue country); expected-runs table'],
    ['Pressure rating', `(Σ recency × runs added on pressure balls + ${s.K} × usual level) ÷ (Σ recency + ${s.K}), per 100 balls`, 'runs added on pressure balls; season'],
    ['Usual level', `Σ recency × runs added on other balls ÷ (Σ recency + ${s.K}), per 100 balls`, 'runs added on all other balls'],
    ['Lift', 'Pressure rating − usual level', 'the two above'],
    ['Win impact', 'Change in the chance of winning across the player’s pressure balls, per 100 balls', 'chance of winning before and after each ball'],
    ['Consistency', 'Share of pressure innings or spells (6+ pressure balls) with positive runs added', 'runs added per match'],
    ['Top-10 confidence', 'Share of 400 re-runs on resampled matches in which the player stays top 10', 'the whole ranking, re-run'],
  ]

  // every setting and assumption, with its value and the reason for it
  const settings: { group: string; rows: [string, string, string][] }[] = [
    {
      group: 'The four model settings (each chosen with the forward test)',
      rows: [
        ['Pressure line', `Top 20% of balls by stakes (${s.pressure_threshold.toFixed(2)}×)`, 'Rare enough to be real pressure, common enough to give each player a usable sample'],
        ['Lean on usual level (K)', `${s.K} balls`, 'A pressure record counts half at 200 recency-weighted balls, more after'],
        ['Recency', weights, 'Each year back 20% less; steeper steps helped batting a little and hurt bowling more'],
        ['Evidence to be ranked', `${e.min_pressure_balls} pressure balls, ${e.min_pressure_matches} matches, ${e.min_recent_balls} in ${e.recent_from}–26`, 'Enough to judge, and every pick has played top-level cricket recently'],
      ],
    },
    {
      group: 'What counts as pressure',
      rows: [
        ['Knockouts', 'Every ball is a pressure ball', 'Lose and you are out, whatever the scoreboard says'],
        ['Knockout first innings', 'Each ball counts half (rating and evidence)', 'The other side still has to bat; batting forecast 0.079 → 0.084'],
        ['Rain', `Matches under ${s.min_match_balls / 6} overs a side left out of pressure (${s.n_short_excluded} matches)`, 'A five-over slog is a different game; longer reduced games use the revised target'],
        ['Super overs', 'Left out', 'A different contest from the 20 overs'],
        ['Pressure appearance', `A match with ${6}+ pressure balls`, 'A one-ball cameo is not a pressure innings or spell'],
        ['Phases', 'Powerplay 1–6, middle 7–15, death 16–20', 'The standard T20 split'],
      ],
    },
    {
      group: 'Chance of winning',
      rows: [
        ['Model', 'Logistic, on runs needed ÷ runs still expected; first innings on projected total ÷ par', 'Smooth in runs and balls, which stakes need'],
        ['Validation', '5-fold, grouped by match', 'A match never trains and tests at once'],
        ['Final over of a chase', 'Exact ball-by-ball calculation', 'The smooth model gave a last-ball boundary almost no chance'],
        ['Final-over inputs', 'Outcome frequencies from the last 2 overs, by runs needed per ball (<1.5, 1.5–3, 3+) and wickets (1, 2–3, 4–5, 6+)', 'Small groups lean on the overall mix (weight 150 balls)'],
        ['Ties', 'Scores level at the end = 50%', 'A super over is close to a coin flip'],
        ['Next-ball outcomes', '0, 1, 2, 3, 4, 6, wicket, wide; 5s counted as 4s', 'How often each happens, by phase'],
      ],
    },
    {
      group: 'Runs added',
      rows: [
        ['Expected runs', 'Gradient-boosted model by balls left, wickets, IPL or T20I, season; smoothed over ±9 balls', 'More wickets lost can never mean more runs to come'],
        ['Bowler charges', 'Bat runs, wides and no-balls; not byes or leg byes', 'A bowler cannot stop a bye'],
        ['Bowler wickets', 'Run outs not credited', 'Not the bowler’s doing'],
        ['Average = 0', 'Recentred per competition and season', 'The 2024–26 IPL scoring boom flatters nobody'],
        ['T20I conditions', 'Recentred by host country × season, then opponent × season', 'Bangladesh T20Is go at 7.9 an over, other T20Is 8.7; weak attacks flatter everyone'],
        ['Which cricket', `IPL and T20Is between the 12 full members (${fmt.int(s.n_top_level_matches)} matches)`, 'One clear rule instead of a made-up discount for associate cricket'],
      ],
    },
    {
      group: 'Who can be ranked and recommended',
      rows: [
        ['Indian players', `A third of the bar: ${e.indian_min[0]} balls, ${e.indian_min[1]} matches, ${e.indian_min[2]} in ${e.recent_from}–26`, 'The pack has no domestic cricket, so an Indian player’s only top-level cricket is the IPL'],
        ['Indian places', `Up to ${e.indian_places} guaranteed, only if rating > 0`, rr.slots ? `RR have only ${rr.slots.open_overseas} overseas places left; never a below-average player` : 'Overseas places are scarce'],
        ['Bangladesh', `At most ${e.max_bangladesh} per top 10`, 'The board often limits IPL release (NOC)'],
        ['Active in 2026', 'Played top-level cricket in 2026 (IPL or full-member T20I)', 'An auction buys 2027 form; the 2025–26 evidence rule alone can be met in early 2025'],
        ['No dip', 'Lift must be 0 or more', 'The brief asks who rises; a player who dips is never picked'],
        ['Not buyable', 'RR’s squad, other teams’ retentions, retired, banned, Pakistani players', 'The list is for the 2027 auction'],
        ['Ordering', 'By pressure rating alone', 'Blending in win impact or consistency predicted worse'],
      ],
    },
    {
      group: 'Checks',
      rows: [
        ['Forward test', 'Rate on 2022–24 and 2022–25, score on 2025 and 2026; 25+ balls before, 24+ after', 'The only test that asks what we need: who delivers next'],
        ['Re-runs', '400 resamples of whole matches (fixed seed)', 'Shows which ranks are safe'],
        ['Safe pick', 'Top 10 in 50%+ of re-runs; under 50% is a close call', 'A plain reading of the re-runs'],
        ['Split halves', 'Odd against even matches', 'Shows which measures repeat'],
      ],
    },
    {
      group: 'Picks page only (never the ranking)',
      rows: [
        ['Emerging', 'Born on or after 1 April 2001 (under 26 for IPL 2027)', 'The IPL Emerging Player age test'],
        ['Emerging bar', '25 pressure balls, 2 matches, 10 in 2025–26; 5 per role; no dip', 'Half the main bar: young players have had less time'],
        ['Tipped but dipping', '50+ pressure balls and negative lift', 'Enough evidence to say so'],
        ['Indian options', 'Signable Indian in an IPL 2026 squad; 17+ pressure balls in 2+ matches; no dip; rating −1 or better; listed in his main role', 'Retentions took almost every above-average Indian; these are the next best, shown as options, not picks'],
        ['Short-term buy', '35 or older during IPL 2027', 'Flagged, not marked down'],
        ['Role at RR', 'Best phase with 30+ pressure balls (15 for emerging)', 'Fewer balls in a phase is too thin to call a strength'],
        ['RR gap', 'A phase where RR were below average, or behind the other playoff sides', 'The bar for winning the title'],
        ['Retained roles', 'Keeper if he kept in a quarter of matches since 2024; all-rounder 6+ balls bowled and 8+ faced a match; bowler 6+ balls a match', 'The pack has no role field'],
        ['Squad rules', '25 players, 8 overseas', 'IPL squad limits'],
      ],
    },
  ]

  const terms: [string, ReactNode][] = (
    ['pressureBall', 'stakes', 'underPressure', 'normal', 'lift', 'winImpact', 'consistency', 'recentForm', 'confidence', 'rankRange', 'rank', 'qualified', 'phase'] as const
  ).map((k) => [TERMS[k].label, TERMS[k].def])

  const solid = (role: Role) => getRanked(role).slice(0, 4).filter((p) => (p.boot?.p_top10 ?? 0) > 0.5).length

  return (
    <>
      <PageHead
        title="How it works"
        summary="Two questions for every ball since 2022: how much was at stake, and how did the player do against an average player in the same spot?"
      />

      <nav aria-label="On this page" className="mb-6 flex flex-wrap gap-2">
        {CONTENTS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-lg border border-line bg-panel px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:border-pink hover:text-foreground">
            {label}
          </a>
        ))}
      </nav>

      {/* ------------------------------------------------------------ the method */}
      <ol id="steps" className="flex scroll-mt-24 flex-col gap-px overflow-hidden rounded-[10px] border border-line bg-line">
        {steps.map((st, i) => (
          <li key={st.t} className="grid gap-4 bg-panel p-5 md:grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1fr)] md:gap-6">
            <span className="display num text-[3rem] leading-none text-pink">{i + 1}</span>
            <div>
              <h2 className="mb-2 text-[17px] font-semibold">{st.t}</h2>
              <Bullets items={st.d} />
            </div>
            <p className="rounded-lg bg-panel-2 px-4 py-3 text-[14px] leading-relaxed text-ink-2 [&_b]:text-ink">
              <span className="mb-1 block text-[12.5px] font-semibold text-blue">Example</span>
              {st.ex}
            </p>
          </li>
        ))}
      </ol>

      {/* ------------------------------------------------------------ 1. pressure definition */}
      <SectionHead title="1. What counts as pressure" id="pressure">
        The label never sees how players did, yet cricket changes just as you would expect when it is on.
      </SectionHead>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <Stat label="Wickets per 100 balls" value={c.pressure.wkt_pct.toFixed(1)} tone="pink" note={`against ${c.normal.wkt_pct.toFixed(1)} on other balls`} />
        <Stat label="Wides and no-balls" value={`${c.pressure.extras_pct.toFixed(1)}%`} tone="pink" note={`against ${c.normal.extras_pct.toFixed(1)}%: bowlers feel it too`} />
        <Stat label="Dot balls" value={`${c.pressure.dot_pct.toFixed(0)}%`} tone="pink" note={`against ${c.normal.dot_pct.toFixed(0)}%`} />
        <Stat label="Pressure balls found" value={fmt.int(c.pressure.balls)} note={`out of ${fmt.int(s.n_balls)} deliveries`} />
      </div>
      <div className="mt-6 flex flex-col gap-6">
        <ChaseMap grid={getGrid()} />
        <PressureShape s={s} />
      </div>

      <h3 id="checks" className="mb-3 mt-8 scroll-mt-24 text-[17px] font-semibold">Does it find the moments anyone would name?</h3>
      <SanityChecks pools={{ bat: bat.players, bowl: bowl.players }} />
      <div className="mt-4 flex flex-col gap-3">
        <Details title="The tensest balls in five years (almost all last-ball finishes)">
          <MomentsTable moments={s.moments} />
        </Details>
        <Details title="The last over of a chase, worked out exactly">
          <Bullets
            className="mb-4"
            items={[
              'The smooth model is right for most of a match but too gloomy at the very end',
              'It gave a side needing a boundary off the last ball almost no chance',
              'So the final over is calculated ball by ball from how often each outcome really happens',
            ]}
          />
          <EndgameTable e={s.wp_model.endgame} />
        </Details>
      </div>

      {/* ------------------------------------------------------------ 2. measurement */}
      <SectionHead title="2. Measuring performance" id="measure">
        Every step for the top-ranked batter, {ex.name}, with the real numbers. A script checks the sums against the published rating.
      </SectionHead>
      <WorkedExample e={ex} threshold={s.pressure_threshold} />

      <h3 id="sources" className="mb-3 mt-8 scroll-mt-24 text-[17px] font-semibold">Where every number comes from</h3>
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
      <p className="mt-2 text-[13px] text-ink-3">
        Full list of files, and what was blended in from public data:{' '}
        <Link href="/sources/" className="font-semibold text-pink-ink hover:underline">
          Data used
        </Link>
      </p>

      {/* ------------------------------------------------------------ 3. fair comparisons */}
      <SectionHead title="3. Fair comparisons" id="fair">
        Who can be ranked, who can be picked, and the choices that stop the wrong things being rewarded.
      </SectionHead>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Card title="Who can be ranked">
          <Bullets
            items={[
              `${e.min_pressure_balls}+ pressure balls in ${e.min_pressure_matches}+ matches`,
              `${e.min_recent_balls}+ of them in ${e.recent_from}–26, so every pick is current`,
              `Indian players: a third of that (${e.indian_min[0]} balls, ${e.indian_min[1]} matches, ${e.indian_min[2]} recent), as the pack has no domestic cricket`,
              `${bat.eligibility.n_eligible} batters and ${bowl.eligibility.n_eligible} bowlers qualify`,
            ]}
          />
        </Card>
        <Card title="Who can be picked">
          <Bullets
            items={[
              'Only players RR can buy at the 2027 auction',
              'Only players active in 2026 (IPL or full-member T20I)',
              'Never a player who dips under pressure (negative lift)',
              `Each above-average Indian gets a place (up to ${e.indian_places})${rr.slots ? `: RR have ${rr.slots.open_overseas} overseas places left` : ''}`,
              `At most ${e.max_bangladesh} Bangladeshi player per list (board release)`,
            ]}
          />
        </Card>
        <Card title="Small samples">
          <Bullets
            items={[
              `The rating leans on the usual level until the pressure record is long (${s.K} balls for half and half)`,
              owen && `${owen.name}: ${signed(owen.p_raw100)} on his first ${owen.p_balls} pressure balls, rated ${signed(owen.p_rv100)}`,
            ]}
          />
        </Card>
        <Card title="Same situation, same yardstick">
          <Bullets
            items={[
              'Each ball is compared with an average player with the same balls left and wickets in hand',
              'Within the same competition and season',
              'Thirty off 18 with the tail exposed earns more than forty with the top order intact',
            ]}
          />
        </Card>
        <Card title="Pitches and opponents">
          <Bullets
            items={[
              'T20Is: Bangladesh 7.9 runs an over, other T20Is 8.7, the IPL 9.3',
              'Each T20I ball is compared within its host country, then its opponent, each season',
              'Batting forecasts roughly doubled; bowling dipped slightly, within noise',
            ]}
          />
        </Card>
        <Card title="Batting first and knockouts">
          <Bullets
            items={[
              'A first-innings ball moves the result less, because the chase is still to come',
              'Every knockout ball counts as pressure, so a big knockout total earns credit',
              'Each knockout first-innings ball counts half',
              'Rejected: a separate line for the first innings (it flagged most over-one balls)',
            ]}
          />
        </Card>
        <Card title="Rain">
          <Bullets
            items={[
              `Reduced matches use their revised overs and target: ${s.n_reduced_included} count, including the 2023 IPL final`,
              `${s.n_short_excluded} matches cut below ${s.min_match_balls / 6} overs a side are left out of pressure`,
            ]}
          />
        </Card>
        <Card title="Economy and wickets both count">
          <Bullets items={['Every run kept below an average bowler from the same spot', 'Each wicket at the runs it costs from there (about 10 early, 2.6 at the death)']} />
        </Card>
        <Card title="Built for 2027">
          <Bullets
            items={[
              '2026 counts in full; each year back 20% less',
              'Nobody is marked down for age; 35+ is flagged as a short-term buy instead',
              <>
                Under-26s get their own{' '}
                <Link href="/picks/#emerging" className="font-semibold text-pink-ink hover:underline">
                  emerging list
                </Link>{' '}
                on half the bar
              </>,
            ]}
          />
        </Card>
      </div>

      {/* ------------------------------------------------------------ 4. evidence for the top 10 */}
      <SectionHead
        title="4. Evidence for the top 10"
        id="top10"
        action={
          <Link href="/picks/" className="text-[14px] font-semibold text-pink-ink hover:underline">
            Why I back each one
          </Link>
        }
      >
        Ordered by pressure rating. Win impact and top-10 confidence are evidence, not part of the order.
      </SectionHead>
      <div className="grid gap-4 xl:grid-cols-2">
        {(['bat', 'bowl'] as const).map((role) => (
          <TopTable key={role} role={role} players={getRanked(role).slice(0, 10)} />
        ))}
      </div>
      <Bullets
        className="mt-3 text-[13.5px]"
        items={[
          <>
            <b>Win impact can be negative for a player who adds runs:</b> it depends on the match he walked into, and repeats poorly
          </>,
          <>
            <b>Confidence can differ from rank:</b> a long record is steadier than a short one with a similar rating
          </>,
          <>
            <b>Rank 10 below a higher rating:</b> the guaranteed Indian place and the one-Bangladeshi rule can move a player in or out
          </>,
        ]}
      />

      {/* ------------------------------------------------------------ 5. reliability */}
      <SectionHead title="5. Reliability and limits" id="reliability">
        The forward test: rate players on earlier seasons only, then check who actually added runs under pressure the next season. 0 =
        no better than guessing.
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
        <p className="border-t border-line px-4 py-3 text-[13px] text-ink-3">
          Correlation with the next season’s runs added per pressure ball, pooled over 2025 and 2026 ({s.forward.bat.n} batters,{' '}
          {s.forward.bowl.n} bowlers).
        </p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <Card title="What the test shows">
          <Bullets
            items={[
              <>
                <b>Bowlers:</b> the rating is the best predictor, beating usual level and lift alone
              </>,
              <>
                <b>Batters:</b> usual level predicts slightly better, so the rating leans on it until the record is long
              </>,
              <>
                <b>“Clutch” is real but small:</b> lift repeats weakly between odd and even matches ({bat.split_half.lift.toFixed(2)} batting,{' '}
                {bowl.split_half.lift.toFixed(2)} bowling), so it is a filter, not a score
              </>,
              'Blending in win impact, lift or consistency made forecasts worse',
            ]}
          />
        </Card>
        <Card title="Where it is less certain">
          <Bullets
            items={[
              `Top of each list is solid: of the top four, ${solid('bat')} batters and ${solid('bowl')} bowlers stay top 10 in over half of re-runs`,
              'Lower ranks are close calls that swap with the next few names',
              'A Bangladeshi player’s confidence is lower, as another may take the one place',
              'Not seen: fielding, pitches, match-ups, injuries, domestic cricket, the 2022 and 2024 World Cups',
              'First-innings pressure is harder to measure, so pressure balls lean towards chases',
            ]}
          />
        </Card>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <Details title="Which ranks are safe and which are close calls?">
          <StabilityPair bat={getRanked('bat').slice(0, 15)} bowl={getRanked('bowl').slice(0, 15)} />
        </Details>
        <Details title="Is the win-chance model accurate?">
          <CalibrationPair s={s} />
        </Details>
        <Details title="Do the measures repeat from one set of matches to another?">
          <table className="w-full max-w-lg text-[13.5px]">
            <caption className="mb-2 text-left text-[13px] text-ink-3">Each measure on odd and on even matches: how closely the halves agree (1 = perfectly).</caption>
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
      </div>

      {/* ------------------------------------------------------------ every setting */}
      <SectionHead title="Every number chosen" id="settings">
        Each setting and assumption in the analysis, with its value and the reason for it.
      </SectionHead>
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[760px] text-[13.5px]">
          <thead className="text-[12.5px] text-ink-3">
            <tr className="border-b border-line">
              <th className="px-4 py-2.5 text-left font-medium">Setting</th>
              <th className="px-4 py-2.5 text-left font-medium">Value</th>
              <th className="px-4 py-2.5 text-left font-medium">Why</th>
            </tr>
          </thead>
          {settings.map((g) => (
            <tbody key={g.group}>
              <tr className="border-b border-line bg-panel-2">
                <th colSpan={3} className="px-4 py-2 text-left text-[12.5px] font-semibold uppercase tracking-wide text-pink-ink">
                  {g.group}
                </th>
              </tr>
              {g.rows.map(([k, v, why]) => (
                <tr key={k} className="border-b border-line align-top">
                  <td className="w-[20%] px-4 py-2.5 font-semibold">{k}</td>
                  <td className="w-[38%] px-4 py-2.5 text-ink">{v}</td>
                  <td className="px-4 py-2.5 text-ink-2">{why}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <p className="mt-2 text-[13px] text-ink-3">
        Reproduce: <code className="rounded bg-panel-2 px-1">python -I analysis/pipeline.py</code>, then{' '}
        <code className="rounded bg-panel-2 px-1">analysis/rr2026.py</code> and <code className="rounded bg-panel-2 px-1">analysis/worked_example.py</code>.
        A rerun gives byte-identical results.
      </p>

      <SectionHead title="Glossary" id="glossary" />
      <dl className="grid gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-2">
        {terms.map(([t, d]) => (
          <div key={t} className="bg-panel px-5 py-3.5">
            <dt className="font-semibold">{t}</dt>
            <dd className="mt-0.5 text-[14px] leading-relaxed text-ink-2">{d}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="panel p-4">
      <h3 className="mb-2 text-[15px] font-semibold">{title}</h3>
      {children}
    </div>
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
                  {p.indian && <span className="rounded bg-pink-soft px-1.5 text-[11px] font-semibold text-pink-ink">IND</span>}
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
        <span className="text-[13px] font-medium text-pink-ink group-open:hidden">Show</span>
        <span className="hidden text-[13px] font-medium text-ink-3 group-open:inline">Hide</span>
      </summary>
      <div className="border-t border-line p-5">{children}</div>
    </details>
  )
}
