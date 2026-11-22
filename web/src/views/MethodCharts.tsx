'use client'

import { ChartFrame } from '@/components/charts/core'
import { Calibration, RankRanges } from '@/components/charts/Profile'
import { rescore, type Player, type Summary } from '@/lib/types'

// default-pool players in their submitted order, with z-scores filled in
const asScored = (ps: Player[]) =>
  rescore(ps)
    .filter((p) => p.rank != null)
    .map((p) => ({ ...p, liveRank: p.rank! }))
    .toSorted((a, b) => a.liveRank - b.liveRank)

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

