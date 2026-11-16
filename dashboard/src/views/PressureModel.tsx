import { useState } from 'react'
import { LiHistogram, PhaseBars } from '../components/charts/Bars'
import { ChartFrame, Legend } from '../components/charts/core'
import { ChaseHeatmap } from '../components/charts/Heatmap'
import { LineChart } from '../components/charts/LineChart'
import type { AppData } from '../lib/data'
import { fmt } from '../lib/format'

export function PressureModel({ data }: { data: AppData }) {
  const s = data.summary
  const [wkts, setWkts] = useState(6)
  const overs = [1, 2].map((inn) => ({
    key: `inn${inn}`,
    label: inn === 1 ? 'Batting first' : 'Chasing',
    color: inn === 1 ? 'var(--blue)' : 'var(--pink)',
    points: s.by_over.filter((r) => r.innings === inn).map((r) => ({ x: r.over, y: r.li })),
  }))
  const wk = [1, 2].map((inn) => ({
    key: `w${inn}`,
    label: inn === 1 ? 'Batting first' : 'Chasing',
    color: inn === 1 ? 'var(--blue)' : 'var(--pink)',
    points: s.by_wkts.filter((r) => r.innings === inn && r.wkts <= 8).map((r) => ({ x: r.wkts, y: r.li })),
  }))

  return (
    <div className="flex flex-col gap-6">
      <header className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col gap-3">
          <p className="eyebrow">Step 1 · Defining pressure</p>
          <h1 className="display text-[2.3rem] font-bold leading-none">Pressure is what a ball can swing</h1>
          <p className="max-w-[62ch] text-[14.5px] leading-relaxed text-ink-2">
            A good pressure measure should not just count death overs or high required rates. It should be high when the
            next ball could decide the match, and near zero when the result is already settled. A chase needing 60 off 18
            with two wickets left feels tense, but it is close to lost. A chase needing 12 off 6 with six wickets in hand
            is where a single ball changes everything.
          </p>
        </div>
        <ol className="panel flex flex-col divide-y divide-line text-[13.5px] leading-relaxed">
          <Step n={1} title="Win probability model">
            Logistic models, one per innings, built on run-expectancy “resources” in the spirit of Duckworth–Lewis. In a
            chase the key input is runs needed against the runs the side can still expect to make with its balls and wickets.
            Batting first, it is the projected total against the season’s par score. The models are smooth by design and
            validated on held-out matches.
          </Step>
          <Step n={2} title="Leverage of the next ball">
            For every delivery, the model scores all possible outcomes (dot, 1, 2, 3, 4, 6, wicket, wide) and weights the
            swing in win probability by how often each happens in that phase. The expected swing is divided by the average,
            so <b>LI 1.0 is a typical ball</b> and LI 3.0 carries three times the stakes.
          </Step>
          <Step n={3} title="Match stakes and threshold">
            Knockout fixtures (finals, qualifiers, eliminators, semi-finals) carry a ×{s.knockout_mult} multiplier. The
            top 20% of deliveries by this Pressure Index (LI ≥ {s.pressure_threshold.toFixed(2)}) form the high-pressure
            set. Everything else is the player’s baseline.
          </Step>
        </ol>
      </header>

      <ChartFrame
        title="Where pressure lives in a chase"
        subtitle="Leverage for every chase state the model can see. Pressure peaks along the diagonal where the required rate is realistic but not comfortable. Hover a cell for the win probability."
        legend={
          <div className="flex flex-wrap items-center gap-3 text-[13px] text-ink-2">
            <label htmlFor="wk" className="font-medium text-ink">
              Wickets in hand
            </label>
            <input
              id="wk"
              type="range"
              min={1}
              max={10}
              value={wkts}
              onChange={(e) => setWkts(Number(e.target.value))}
              className="w-48"
            />
            <span className="display num text-[1.3rem] font-semibold text-pink">{wkts}</span>
          </div>
        }
        footnote="IPL 2025 calibration. Darker cells: one ball moves the result more. The pale lower-left corner is a chase already won, and the pale upper-right is one already lost."
      >
        <ChaseHeatmap grid={data.grid} wkts={wkts} />
      </ChartFrame>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartFrame
          title="Leverage by over"
          subtitle="Mean LI of each over. Chases build pressure steadily, while first innings only spike at the death."
          legend={<Legend items={overs.map((o) => ({ label: o.label, color: o.color, shape: 'line' }))} />}
        >
          <LineChart series={overs} xLabel="Over" yLabel="Mean Leverage Index" xTicks={[1, 4, 8, 12, 16, 20]} refY={{ y: 1, label: 'average ball' }} yFormat={(v) => v.toFixed(1)} xFormat={(v) => `${v}`} />
        </ChartFrame>
        <ChartFrame
          title="Leverage by wickets down"
          subtitle="Losing wickets raises the stakes of every ball that follows, which is how collapses register as pressure."
          legend={<Legend items={wk.map((o) => ({ label: o.label, color: o.color, shape: 'line' }))} />}
        >
          <LineChart series={wk} xLabel="Wickets already fallen" yLabel="Mean Leverage Index" xTicks={[0, 2, 4, 6, 8]} refY={{ y: 1, label: 'average ball' }} yFormat={(v) => v.toFixed(1)} showPoints />
        </ChartFrame>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <ChartFrame
          title="How the threshold splits the game"
          subtitle="Most deliveries carry little leverage. A long right tail of high-stakes moments makes up the pressure set."
        >
          <LiHistogram bins={s.li_hist} threshold={s.pressure_threshold} />
        </ChartFrame>
        <ChartFrame
          title="Share of balls under pressure"
          subtitle="By phase and innings. Chases dominate: once a target exists, each ball moves the result far more than anything batting first."
          legend={
            <Legend
              items={[
                { label: 'Batting first', color: 'var(--blue)' },
                { label: 'Chasing', color: 'var(--pink)' },
              ]}
            />
          }
        >
          <PhaseBars rows={s.by_phase} />
        </ChartFrame>
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h3 className="display text-[1.3rem] font-semibold">The highest-leverage balls in the data</h3>
          <p className="text-[13px] text-ink-2">One per match, chases only. These are the moments the model rates highest.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead className="text-left text-[11px] uppercase tracking-wider text-ink-3">
              <tr className="border-b border-line">
                <th className="px-5 py-2 font-medium">Match</th>
                <th className="px-3 py-2 font-medium">Ball</th>
                <th className="px-3 py-2 font-medium">Situation</th>
                <th className="px-3 py-2 font-medium">Striker v bowler</th>
                <th className="px-3 py-2 text-right font-medium">Chase win %</th>
                <th className="px-5 py-2 text-right font-medium">LI</th>
              </tr>
            </thead>
            <tbody>
              {s.moments.map((mo) => (
                <tr key={mo.match + mo.date} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5">
                    <div className="font-medium">{mo.match}</div>
                    <div className="text-[11.5px] text-ink-3">
                      {mo.comp} · {fmt.date(mo.date)}
                    </div>
                  </td>
                  <td className="num px-3 py-2.5">{mo.over}</td>
                  <td className="px-3 py-2.5">{mo.state}</td>
                  <td className="px-3 py-2.5">
                    {mo.striker} <span className="text-ink-3">v</span> {mo.bowler}
                  </td>
                  <td className="num px-3 py-2.5 text-right">{fmt.pct(mo.wp)}</td>
                  <td className="num px-5 py-2.5 text-right font-semibold text-pink">{mo.li.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[2rem_1fr] gap-3 p-4">
      <span className="display num text-[1.6rem] font-bold leading-none text-pink">{n}</span>
      <div>
        <div className="font-semibold text-ink">{title}</div>
        <p className="text-ink-2">{children}</p>
      </div>
    </li>
  )
}
