import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { ChartFrame, Legend } from '@/components/charts/core'
import { CalibrationMulti, HBars, IntervalChart, MODEL_COLOR, MODEL_LABEL, ReSurface, TuningHeatmap, WpCurves } from '@/components/charts/LabCharts'
import { Bullets, PageHead, SectionHead, Stat } from '@/components/kit'
import { getLab, getSummary } from '@/lib/data'
import { fmt } from '@/lib/format'
import type { ModelMetrics } from '@/lib/types'
import { cn } from '@/lib/utils'
import { EndgameTable } from '@/views/EndgameTable'

export const metadata: Metadata = { title: 'Model Lab' }

const CONTENTS: [string, string][] = [
  ['wp', 'Win-probability models'],
  ['re', 'Run expectancy'],
  ['endgame', 'Exact final over'],
  ['tuning', 'Hyperparameter sweep'],
  ['next', 'Next-season model'],
  ['similarity', 'Similar-player recommender'],
  ['reliability', 'Reliability'],
  ['card', 'Model card'],
]

function Panel({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('panel p-5', className)}>
      {title && <h3 className="mb-3 text-[15px] font-semibold">{title}</h3>}
      {children}
    </div>
  )
}

function MetricTable({ cv, hold, season }: { cv: Record<string, ModelMetrics>; hold: Record<string, ModelMetrics>; season: number }) {
  const keys = Object.keys(cv)
  const best = (src: Record<string, ModelMetrics>, m: keyof ModelMetrics, hi: boolean) =>
    keys.reduce((a, b) => ((hi ? src[b][m] > src[a][m] : src[b][m] < src[a][m]) ? b : a))
  const cols: [keyof ModelMetrics, string, boolean][] = [
    ['auc', 'AUC ↑', true],
    ['brier', 'Brier ↓', false],
    ['logloss', 'Log-loss ↓', false],
    ['ece', 'ECE ↓', false],
  ]
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-[13px]">
        <thead className="text-[12px] text-ink-3">
          <tr className="border-b border-line">
            <th className="py-2 text-left font-medium">Model</th>
            {cols.map(([k, l]) => (
              <th key={k} className="py-2 text-right font-medium" colSpan={1}>
                {l}
              </th>
            ))}
            <th className="py-2 pl-4 text-right font-medium">Holdout {season} AUC</th>
            <th className="py-2 text-right font-medium">Brier</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k} className="border-b border-line last:border-0">
              <td className="py-2">
                <span className="flex items-center gap-2">
                  <span className="inline-block size-2.5 rounded-full" style={{ background: MODEL_COLOR[k] }} />
                  <span className={k === 'logistic' ? 'font-semibold' : 'text-ink-2'}>{MODEL_LABEL[k]}</span>
                </span>
              </td>
              {cols.map(([m, , hi]) => (
                <td key={m} className={cn('num py-2 text-right', best(cv, m, hi) === k ? 'font-semibold text-foreground' : 'text-ink-2')}>
                  {cv[k][m].toFixed(4)}
                </td>
              ))}
              <td className={cn('num py-2 pl-4 text-right', best(hold, 'auc', true) === k ? 'font-semibold' : 'text-ink-2')}>{hold[k].auc.toFixed(4)}</td>
              <td className={cn('num py-2 text-right', best(hold, 'brier', false) === k ? 'font-semibold' : 'text-ink-2')}>{hold[k].brier.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[12px] text-ink-3">Bold = best in the column. Left: 5-fold cross-validation grouped by match. Right: trained on earlier seasons, tested on {season}.</p>
    </div>
  )
}

export default function LabPage() {
  const lab = getLab()
  const s = getSummary()
  const wp = lab.wp_comparison
  const tun = lab.tuning
  const ns = lab.next_season

  return (
    <>
      <PageHead
        title="Model Lab"
        summary="Every model in the pipeline, how it was validated, what it was compared against, and where it falls short. Negative results are reported as plainly as positive ones."
      >
        <div className="grid grid-cols-2 gap-2 sm:w-[30rem]">
          <Stat label="Chase WP AUC (CV)" value={s.wp_model['2'].auc.toFixed(3)} note={`${fmt.int(s.wp_model['2'].n_balls)} balls`} />
          <Stat label="First-innings WP AUC" value={s.wp_model['1'].auc.toFixed(3)} note="harder: the chase is still to come" />
        </div>
      </PageHead>

      <nav aria-label="On this page" className="mb-2 flex flex-wrap gap-2">
        {CONTENTS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-md border border-line bg-panel px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:border-signal hover:text-foreground">
            {label}
          </a>
        ))}
      </nav>

      {/* ------------------------------------------------------------ WP models */}
      <SectionHead title="Win-probability models" id="wp">
        Three candidates on the same split. The production logistic model uses engineered “resources” features (runs needed against runs the side can still expect,
        from the run-expectancy model); the boosting models get the raw match state as well.
      </SectionHead>
      {wp && (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            {(['2', '1'] as const).map((inn) => (
              <Panel key={inn} title={inn === '2' ? 'Second innings (chase)' : 'First innings'}>
                <MetricTable cv={wp.innings[inn].cv} hold={wp.innings[inn].holdout} season={wp.innings[inn].holdout_season} />
              </Panel>
            ))}
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <ChartFrame
              title="Calibration, chase"
              subtitle="Out-of-fold predictions binned by decile against the share of those balls where the chasing side actually won. On the dashed diagonal = perfectly calibrated."
              legend={<Legend items={Object.keys(MODEL_LABEL).map((k) => ({ label: MODEL_LABEL[k], color: MODEL_COLOR[k], shape: 'line' }))} />}
            >
              <CalibrationMulti series={wp.innings['2'].calibration} />
            </ChartFrame>
            <ChartFrame
              title="What the boosting model relies on"
              subtitle="Permutation importance on the holdout season: how much log-loss rises when one feature is shuffled. The engineered resources features dominate, which is why a linear model on them is enough."
            >
              <HBars rows={wp.innings['2'].importance.map((r) => ({ label: r.feature, value: r.importance, highlight: r.feature.startsWith('resources') }))} unit="permutation importance" />
            </ChartFrame>
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <ChartFrame
              title="Chase WP by runs needed"
              subtitle="Production model, IPL, 36 balls (6 overs) left. Each line is a number of wickets in hand; darker = more wickets."
            >
              <WpCurves curves={wp.curves.by_wickets.map((c) => ({ k: c.wkts, points: c.points }))} xLabel="Runs needed" keySuffix=" wkts" />
            </ChartFrame>
            <ChartFrame title="Chase WP by overs left" subtitle="Production model, IPL, 6 wickets in hand. Each line is a target still to get; darker = more runs needed.">
              <WpCurves curves={wp.curves.by_need.map((c) => ({ k: c.need, points: c.points }))} xLabel="Overs left" keyPrefix="need " />
            </ChartFrame>
          </div>
          <Panel className="mt-4" title="Why production stays logistic">
            <Bullets
              items={[
                <>
                  <b>It scores better.</b> On match-grouped CV the logistic model wins AUC, Brier and log-loss in both innings; boosting edges it only on calibration error in the {wp.innings['2'].holdout_season} holdout.
                </>,
                <>
                  <b>Stakes need a smooth surface.</b> A ball’s stakes are differences in win probability between states one run or one ball apart. Tree ensembles are piecewise
                  constant, so those differences are mostly zero or a jump.
                </>,
                <>
                  <b>Comparison sample:</b> {fmt.int(wp.sample_matches)} matches drawn at random ({fmt.int(wp.innings['2'].n_balls)} chase balls), to keep three models × five folds to minutes. The
                  production metrics above the fold use every match.
                </>,
              ]}
            />
          </Panel>
        </>
      )}

      {/* ------------------------------------------------------------ RE */}
      <SectionHead title="Run expectancy" id="re">
        How many runs a side can still expect, from any number of balls left and wickets lost. A histogram gradient-boosting regressor with a monotonic constraint (losing
        a wicket can never add runs to come), smoothed over ±9 balls; separate surfaces per competition and season.
      </SectionHead>
      <ChartFrame title={`Expected runs to come, ${lab.re_surface.competition} ${lab.re_surface.season}`} subtitle="Darker = more runs still to come. Hover a cell for the value.">
        <ReSurface rows={lab.re_surface.rows} />
      </ChartFrame>

      {/* ------------------------------------------------------------ endgame */}
      <SectionHead title="Exact final over" id="endgame">
        In the last over of a chase the game is short enough to solve exactly: outcome frequencies from the last two overs of real chases, then backward recursion
        over (runs needed, balls left, wickets).
      </SectionHead>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel>
          <EndgameTable e={s.wp_model.endgame} />
        </Panel>
        <Panel title="Honest result">
          <Bullets
            items={[
              <>
                Over all {fmt.int(s.wp_model.endgame.balls)} final-over balls the Brier scores are close: smooth {s.wp_model.endgame.brier_old.toFixed(4)}, exact {s.wp_model.endgame.brier_new.toFixed(4)}.
              </>,
              'The exact model is kept for the situations that matter most for stakes: a boundary needed off the last ball, where the smooth model is far too pessimistic.',
              'It also handles wides and no-balls (a run, and the ball is bowled again) and ties (a super over is close to a coin flip).',
            ]}
          />
        </Panel>
      </div>

      {/* ------------------------------------------------------------ tuning */}
      <SectionHead title="Hyperparameter sweep" id="tuning">
        Walk-forward backtest for every combination: ratings built from seasons before 2025 (then before 2026), scored by their weighted correlation with each player’s
        runs added per pressure ball in that season.
      </SectionHead>
      {tun && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <ChartFrame title="Forward-test correlation" subtitle="Outlined = production setting; ★ = best in the sweep. Change the role or the recency step above the grid.">
            <TuningHeatmap rows={tun.rows} grid={tun.grid} production={tun.production} best={tun.best} />
          </ChartFrame>
          <Panel title="What the sweep says">
            <Bullets
              items={[
                <>
                  <b>More shrinkage predicts better.</b> Forward r rises with K; the best cell (K = {tun.best.K}) scores {tun.best.mean.toFixed(3)} against {tun.production.mean.toFixed(3)} for production (K ={' '}
                  {tun.production.K}).
                </>,
                'Read plainly: next season’s pressure output is mostly a player’s general skill. Pressure-specific form adds little signal.',
                <>
                  <b>Production keeps K = {tun.production.K}.</b> The goal is to describe how players performed under pressure; at K = {tun.best.K} the rating collapses toward the usual level
                  and stops measuring that. The cost is about {(tun.best.mean - tun.production.mean).toFixed(2)} in forward correlation, and it is stated here rather than hidden.
                </>,
                'The pressure line (top 15–20%) and recency step barely matter, which is reassuring: conclusions do not hinge on them.',
              ]}
            />
          </Panel>
        </div>
      )}

      {/* ------------------------------------------------------------ next season */}
      <SectionHead title="Next-season model" id="next">
        Can a learned model beat the hand-built rating? Gradient boosting on 12 player features known before the season, trained with an expanding window and scored
        exactly like the rating.
      </SectionHead>
      {ns && (
        <div className="grid gap-4 xl:grid-cols-2">
          {(['bat', 'bowl'] as const).map((role) => (
            <Panel key={role} title={role === 'bat' ? 'Batters' : 'Bowlers'}>
              <HBars
                rows={[
                  { label: 'Usual level alone', value: ns[role].corr.normal },
                  { label: 'Pressure rating', value: ns[role].corr.rating, highlight: true },
                  { label: 'Gradient boosting (12 features)', value: ns[role].corr.gbm },
                  { label: 'Last season’s pressure form', value: ns[role].corr.last },
                ]}
               
                unit="forward correlation"
              />
              <p className="mt-3 text-[12.5px] text-ink-3">
                {ns[role].n} player-seasons in the test years. Most useful features for boosting:{' '}
                {ns[role].importance
                  .slice(0, 3)
                  .map((f) => f.feature.toLowerCase())
                  .join(', ')}
                .
              </p>
            </Panel>
          ))}
          <Panel className="xl:col-span-2" title="Negative result, kept">
            <Bullets
              items={[
                'The boosting model does not beat the shrinkage rating. With roughly two hundred player-seasons per year it overfits; regularisation and shallow trees were not enough.',
                'Last season’s raw pressure form is close to useless as a predictor, which is exactly why the rating shrinks short records so hard.',
                'The simplest strong baseline (usual level) is competitive with everything, confirming the sweep.',
              ]}
            />
          </Panel>
        </div>
      )}

      {/* ------------------------------------------------------------ similarity */}
      <SectionHead title="Similar-player recommender" id="similarity">
        Content-based recommendation: every player with {lab.similarity.bat.min_balls}+ balls becomes a standardised vector of style and pressure features; neighbours are
        ranked by cosine similarity, so players match on the shape of their game, not only on how good they are.
      </SectionHead>
      <div className="grid gap-4 xl:grid-cols-2">
        {(['bat', 'bowl'] as const).map((role) => {
          const m = lab.similarity[role]
          return (
            <Panel key={role} title={role === 'bat' ? 'Batters' : 'Bowlers'}>
              <HBars
                rows={[
                  { label: 'Same top-10 neighbours, odd vs even matches', value: m.stability.overlap, highlight: true },
                  { label: 'Expected by chance', value: m.stability.chance },
                ]}
                digits={3}
                unit="split-half overlap"
              />
              <p className="mt-3 text-[12.5px] text-ink-3">
                {m.n} players · {m.features.length} features ({m.features.join(', ')}) · {m.stability.lift_over_chance}× chance on {m.stability.players} players present in both halves.
              </p>
            </Panel>
          )
        })}
        <Panel className="xl:col-span-2" title="Reading the stability check">
          <Bullets
            items={[
              'Each half of the data sees only half the matches, so profiles are noisier than the full-data ones the site uses; the overlap is a lower bound on how stable the real recommendations are.',
              'About three times chance means the neighbours reflect a genuine playing style, but individual matches at the edge of the top 10 can swap. Similarity scores are shown so close calls are visible.',
              <>
                Every recommendation explains itself with the distinctive traits both players share (both far from average in the same direction).{' '}
                <Link href="/similar/" className="font-semibold text-signal-ink hover:underline">
                  Try the finder
                </Link>
              </>,
            ]}
          />
        </Panel>
      </div>

      {/* ------------------------------------------------------------ reliability */}
      <SectionHead title="Reliability" id="reliability">
        Bootstrap: the whole ranking re-run 400 times on matches resampled with replacement.
      </SectionHead>
      <div className="grid gap-4 xl:grid-cols-2">
        {(['bat', 'bowl'] as const).map((role) => (
          <ChartFrame
            key={role}
            title={role === 'bat' ? 'Top 10 batters' : 'Top 10 bowlers'}
            subtitle="Dot = rating, bar = 90% bootstrap interval, right = share of re-runs in the top 10."
          >
            <IntervalChart rows={lab.stability[role]} />
          </ChartFrame>
        ))}
      </div>
      <Panel className="mt-4" title="Split halves: does each measure repeat on odd and even matches?">
        <div className="overflow-x-auto">
          <table className="w-full max-w-xl text-[13.5px]">
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
                  <td className="num py-2 text-right">{lab.split_half.bat[k].toFixed(2)}</td>
                  <td className="num py-2 text-right">{lab.split_half.bowl[k].toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ------------------------------------------------------------ model card */}
      <SectionHead title="Model card" id="card" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['Intended use', 'Descriptive analysis of T20 performance in high-stakes moments; a research and portfolio project, not a betting or selection tool.'],
          ['Training data', `${fmt.int(s.n_balls)} deliveries from ${fmt.int(s.n_matches)} IPL and men’s T20I matches (${s.seasons[0]}–${s.seasons.at(-1)}), Cricsheet.`],
          ['Validation', 'Match-grouped 5-fold CV, a time holdout, walk-forward backtests on 2025 and 2026, 400-resample bootstrap, split halves.'],
          ['Limitations', 'No fielding, no bowling-type match-ups, no domestic or non-IPL franchise cricket; first-innings stakes are harder to measure, so pressure balls lean toward chases.'],
        ].map(([t, d]) => (
          <Panel key={t} title={t}>
            <p className="text-[13.5px] leading-relaxed text-ink-2">{d}</p>
          </Panel>
        ))}
      </div>
      <p className="mt-3 text-[13px] text-ink-3">
        Full method and every setting:{' '}
        <Link href="/method/" className="font-semibold text-signal-ink hover:underline">
          Methodology
        </Link>
        .
      </p>
    </>
  )
}
