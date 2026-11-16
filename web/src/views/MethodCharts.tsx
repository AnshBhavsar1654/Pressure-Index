'use client'

import { ChartFrame, Legend } from '@/components/charts/core'
import { LineChart } from '@/components/charts/LineChart'
import { Calibration, RankRanges } from '@/components/charts/Profile'
import type { Player, RoleData, Summary } from '@/lib/types'

const asScored = (ps: Player[]) => ps.map((p) => ({ ...p, liveRank: p.rank, liveScore: p.score }))

export function CalibrationPair({ s }: { s: Summary }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ChartFrame title="Chases" subtitle={`When the model said 70%, chasing sides won about 70% of the time. AUC ${s.wp_model['2'].auc}.`}>
        <Calibration bins={s.wp_model['2'].calibration} />
      </ChartFrame>
      <ChartFrame title="Batting first" subtitle={`Harder to call before a target exists. AUC ${s.wp_model['1'].auc}.`}>
        <Calibration bins={s.wp_model['1'].calibration} />
      </ChartFrame>
    </div>
  )
}

export function StabilityPair({ bat, bowl }: { bat: Player[]; bowl: Player[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartFrame title="Batters: likely rank range" subtitle="Dot: typical rank across 400 re-runs. Bar: where it lands 9 times in 10.">
        <RankRanges players={asScored(bat)} />
      </ChartFrame>
      <ChartFrame title="Bowlers: likely rank range" subtitle="Dot: typical rank across 400 re-runs. Bar: where it lands 9 times in 10.">
        <RankRanges players={asScored(bowl)} />
      </ChartFrame>
    </div>
  )
}

export function ShrinkCurve({ bat, bowl }: { bat: RoleData; bowl: RoleData }) {
  const series = [
    { key: 'bat', label: 'Batters', color: 'var(--pink)', d: bat },
    { key: 'bowl', label: 'Bowlers', color: 'var(--blue)', d: bowl },
  ].map((x) => ({
    key: x.key,
    label: x.label,
    color: x.color,
    points: Object.entries(x.d.k.cv_p).map(([k, v]) => ({ x: Math.log10(Number(k)), y: v })),
  }))
  return (
    <ChartFrame
      title="How much to trust a pressure record"
      subtitle="Error when one half of a player’s matches is used to predict the other half, for different amounts of caution. Lower is better. The curves keep falling, which means a player’s overall quality predicts future pressure output better than their pressure record alone."
      legend={<Legend items={series.map((c) => ({ label: c.label, color: c.color, shape: 'line' }))} />}
    >
      <LineChart
        series={series}
        xLabel="Caution: balls of evidence needed before a record counts for half (log scale)"
        yLabel="Prediction error"
        xTicks={[25, 100, 400, 1600].map((v) => Math.log10(v))}
        xFormat={(v) => String(Math.round(10 ** v))}
        yFormat={(v) => v.toFixed(3)}
        showPoints
        height={240}
      />
    </ChartFrame>
  )
}
