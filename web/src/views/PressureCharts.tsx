'use client'

import { useState } from 'react'
import { LiHistogram, PhaseBars } from '@/components/charts/Bars'
import { ChartFrame, Legend } from '@/components/charts/core'
import { ChaseHeatmap } from '@/components/charts/Heatmap'
import { LineChart } from '@/components/charts/LineChart'
import type { ChaseGrid, Summary } from '@/lib/types'

export function ChaseMap({ grid }: { grid: ChaseGrid }) {
  const [wkts, setWkts] = useState(6)
  return (
    <ChartFrame
      title="Where pressure lives in a chase"
      subtitle="Each square is a chase situation: runs still needed (up) against overs left (across). Darker pink means one ball changes the result more. Move the slider to see how losing wickets shifts the danger zone."
      legend={
        <div className="flex flex-wrap items-center gap-3 text-[14px] text-ink-2">
          <label htmlFor="wk" className="font-semibold text-ink">
            Wickets in hand
          </label>
          <input id="wk" type="range" min={1} max={10} value={wkts} onChange={(e) => setWkts(Number(e.target.value))} className="h-6 w-52" />
          <span className="display num w-6 text-[1.7rem] text-pink">{wkts}</span>
        </div>
      }
      footnote="Pale bottom-left: the chase is as good as won. Pale top-right: as good as lost. Neither is pressure, however tense it looks."
    >
      <ChaseHeatmap grid={grid} wkts={wkts} />
    </ChartFrame>
  )
}

export function PressureShape({ s }: { s: Summary }) {
  const overs = [1, 2].map((inn) => ({
    key: `inn${inn}`,
    label: inn === 1 ? 'Batting first' : 'Chasing',
    color: inn === 1 ? 'var(--blue)' : 'var(--pink)',
    points: s.by_over.filter((r) => r.innings === inn).map((r) => ({ x: r.over, y: r.li })),
  }))
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ChartFrame
        title="How the stakes build through an innings"
        subtitle="Average stakes of a ball in each over (1.0 is a typical ball). Chases tighten as the target nears."
        legend={<Legend items={overs.map((o) => ({ label: o.label, color: o.color, shape: 'line' }))} />}
      >
        <LineChart series={overs} xLabel="Over" yLabel="Stakes of a ball" xTicks={[1, 4, 8, 12, 16, 20]} refY={{ y: 1, label: 'typical ball' }} yFormat={(v) => v.toFixed(1)} />
      </ChartFrame>
      <ChartFrame
        title="Share of balls that count as pressure"
        subtitle="By phase. Once a target exists, each ball matters far more, so chases hold most pressure moments."
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
      <ChartFrame
        className="lg:col-span-2"
        title="Most balls carry little at stake"
        subtitle="Every delivery, sorted by its stakes. Only the top fifth, right of the line, count as high pressure."
      >
        <LiHistogram bins={s.li_hist} threshold={s.pressure_threshold} />
      </ChartFrame>
    </div>
  )
}
