import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Bullets, PageHead, SectionHead, Stat } from '@/components/kit'
import { getLab, getMatches, getSummary } from '@/lib/data'
import { fmt } from '@/lib/format'

export const metadata: Metadata = { title: 'Data & pipeline' }

const STAGES: { cmd: string; title: string; out: string; body: ReactNode[] }[] = [
  {
    cmd: 'download',
    title: 'Fetch open data',
    out: 'data/raw/cricsheet/',
    body: [
      'Cricsheet’s IPL and men’s T20 international archives (one JSON file per match)',
      'The people register (stable player ids) and the names register (full names)',
      'Only matches from 2022 on are kept',
    ],
  },
  {
    cmd: 'build',
    title: 'Canonical tables',
    out: 'data/dataset/*.csv',
    body: [
      'Deliveries, matches, competitions, team membership and players alongside three lookup CSVs',
      'Rain revisions (overs and target), knockout stages and host country resolved per match',
      'Each ICC T20 World Cup becomes its own competition; other T20Is are grouped by year',
    ],
  },
  {
    cmd: 'model',
    title: 'Fit and score',
    out: 'data/cache/balls.parquet · artifacts/models/',
    body: [
      'Run expectancy (monotonic gradient boosting) → win probability (logistic + exact final over)',
      'Stakes of every ball → pressure flag → runs added against an average player',
      'Fitted models saved with joblib; cross-validated metrics written to artifacts/metrics/',
    ],
  },
  {
    cmd: 'evaluate',
    title: 'Validate',
    out: 'artifacts/metrics/*.json',
    body: [
      'Win-probability model comparison: logistic vs gradient boosting vs calibrated boosting',
      'Walk-forward hyperparameter sweep over the rating settings',
      'Next-season prediction model compared with the rating',
    ],
  },
  {
    cmd: 'export',
    title: 'Ship to the dashboard',
    out: 'web/data/*.json · web/public/matches/',
    body: [
      'Ratings with 400-resample bootstrap intervals, split-half and forward tests',
      'Similar-player recommender (cosine nearest neighbours), team seasons, one JSON per player and per match, Model Lab data',
      'The worked example is asserted against the published rating before it is written',
    ],
  },
]

export default function SourcesPage() {
  const s = getSummary()
  const lab = getLab()
  const matches = getMatches()
  const wc = s.world_cups
  return (
    <>
      <PageHead
        title="Data & pipeline"
        summary={
          <>
            Everything is built from open ball-by-ball data and is reproducible end to end with one command per stage. The Python package{' '}
            <code className="num rounded bg-panel-2 px-1 text-[14px]">pressure_index</code> writes every file this dashboard reads.
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Deliveries" value={fmt.int(s.n_balls)} note={`in ${fmt.int(s.n_matches)} matches, ${s.seasons[0]}–${s.seasons.at(-1)}`} />
        <Stat label="IPL matches" value={fmt.int(s.n_ipl_matches)} note={`${s.seasons.length} seasons, every match`} />
        <Stat label="T20 internationals" value={fmt.int(s.n_t20i_matches)} note={`${fmt.int(s.n_t20i_full)} between ICC full members`} />
        <Stat label="Used for ratings" value={fmt.int(s.n_top_level_balls)} note={`balls in ${fmt.int(s.n_top_level_matches)} top-level matches`} />
      </div>

      <SectionHead title="Source" id="source">
        One open dataset, with attribution.
      </SectionHead>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="panel p-5">
          <h3 className="mb-2 text-[15px] font-semibold">
            <a href={s.source.url} className="hover:underline">
              {s.source.name}
            </a>
          </h3>
          <Bullets
            items={[
              'Ball-by-ball records of men’s IPL and T20 international matches, maintained by Stephen Rushe',
              `Licence: ${s.source.licence}`,
              'Downloaded as Cricsheet’s own zip archives; the people register gives every player one id across the IPL and internationals',
              'Fields not in the open data (bowling type, pace or spin, shot type) are not used anywhere',
            ]}
          />
        </div>
        <div className="panel p-5">
          <h3 className="mb-2 text-[15px] font-semibold">ICC Men’s T20 World Cups</h3>
          <ul className="flex flex-col divide-y divide-line">
            {wc.map((w) => (
              <li key={w.name} className="flex items-center justify-between py-2 text-[14px]">
                <span>{w.name}</span>
                <span className="num text-ink-2">{w.matches} matches</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12.5px] text-ink-3">Matches with a result or partial play; washed-out games have no deliveries. Semi-finals and finals count as knockouts.</p>
        </div>
      </div>

      <SectionHead title="The pipeline" id="pipeline">
        Five stages, each a command: <code className="num rounded bg-panel-2 px-1">python -m pressure_index &lt;stage&gt;</code>.
      </SectionHead>
      <ol className="flex flex-col gap-px overflow-hidden rounded-lg border border-line bg-line">
        {STAGES.map((st, i) => (
          <li key={st.cmd} className="grid gap-4 bg-panel p-5 md:grid-cols-[11rem_minmax(0,1fr)_16rem] md:items-start">
            <div className="flex flex-col gap-1">
              <span className="num text-[12px] text-signal-ink">0{i + 1}</span>
              <code className="num text-[14px] font-semibold">{st.cmd}</code>
              <span className="text-[13px] text-ink-3">{st.title}</span>
            </div>
            <Bullets items={st.body} />
            <code className="num rounded-md border border-line bg-panel-2 px-2.5 py-1.5 text-[12px] text-ink-2">{st.out}</code>
          </li>
        ))}
      </ol>

      <SectionHead title="Hand-checked reference tables" id="reference">
        These CSVs live in <code className="num rounded bg-panel-2 px-1">data/dataset/</code> alongside the five generated tables.
      </SectionHead>
      <div className="grid gap-3 md:grid-cols-3">
        {[
          ['city_country.csv', 'Host country for each match city. T20I deliveries are compared within the same host country and season.'],
          ['player_name_overrides.csv', 'Full display names for players the Cricsheet register lists by initials, such as Suryakumar Yadav.'],
          ['nationality_overrides.csv', 'Country overrides for player profiles, including overseas IPL players without T20Is in the dataset.'],
        ].map(([f, d]) => (
          <div key={f} className="panel p-4">
            <code className="num text-[13px] font-semibold">{f}</code>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{d}</p>
          </div>
        ))}
      </div>

      <SectionHead title="Quality checks" id="checks" />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="panel p-5">
          <Bullets
            items={[
              'Refactor parity: the modular pipeline reproduced the original single-script outputs exactly, ball for ball (0.0 difference in stakes, win probability and runs added)',
              'Unit tests: run-expectancy monotonicity, endgame boundary conditions, the rating formula, bootstrap weighting, and GroupKFold never splitting a match',
              'The worked example is recomputed from raw balls and asserted against the published rating on every export',
            ]}
          />
        </div>
        <div className="panel p-5">
          <Bullets
            items={[
              `${s.n_reduced_included} rain-reduced matches are judged on their revised target; ${s.n_short_excluded} cut below ${s.min_match_balls / 6} overs a side are left out of pressure`,
              `${fmt.int(matches.length)} matches have a ball-by-ball page in the match explorer`,
              `Win-probability model trained and cross-validated on ${fmt.int(lab.dataset.train_matches)} matches`,
            ]}
          />
        </div>
      </div>
    </>
  )
}
