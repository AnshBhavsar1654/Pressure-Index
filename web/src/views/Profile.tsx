'use client'

import { ChartFrame, Legend } from '@/components/charts/core'
import { LineChart } from '@/components/charts/LineChart'
import { ComponentBars, MatchStrip } from '@/components/charts/Profile'
import { fmt } from '@/lib/format'
import type { Player, Role } from '@/lib/types'

const LABELS = {
  pressure: 'Output under pressure',
  impact: 'Match-winning impact',
  delta: 'Rise above own normal',
  consistency: 'Consistency',
}

export function ProfileCharts({ p, role }: { p: Player; role: Role }) {
  const seasonSeries = [
    {
      key: 'p',
      label: 'Pressure moments',
      color: 'var(--pink)',
      points: p.seasons.filter((s) => s.p_balls >= 1 && s.p_rv100 != null).map((s) => ({ x: s.season, y: s.p_rv100, n: s.p_balls })),
    },
    { key: 'n', label: 'Ordinary moments', color: 'var(--blue)', points: p.seasons.map((s) => ({ x: s.season, y: s.n_rv100 })) },
  ]
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section className="panel p-5">
          <h2 className="display mb-1 text-[1.5rem]">What drives the rating</h2>
          <p className="mb-4 text-[13px] text-ink-2">Each bar compares the player with every other eligible {role === 'bat' ? 'batter' : 'bowler'}.</p>
          <ComponentBars z={p.z ?? {}} labels={LABELS} />
        </section>
        <ChartFrame
          title="Season by season"
          subtitle={
            role === 'bat'
              ? 'Runs added per 100 balls faced. Every season with a pressure ball is shown; hover a point to see how many balls are behind it, since a season with only a few is a thin sample.'
              : 'Runs saved per 100 balls bowled, so higher is better. Every season with a pressure ball is shown; hover a point to see how many balls are behind it, since a season with only a few is a thin sample.'
          }
          legend={<Legend items={seasonSeries.map((s) => ({ label: s.label, color: s.color, shape: 'line' }))} />}
        >
          <LineChart series={seasonSeries} xTicks={p.seasons.map((s) => s.season)} zeroLine showPoints yFormat={(v) => fmt.signed(v, 0)} height={250} />
        </ChartFrame>
      </div>
      <ChartFrame
        title="Every match with pressure moments"
        subtitle="One bar per match, oldest to newest: runs added in that match’s pressure balls. Pink is above an average player, blue below. A long run of pink is what consistency looks like."
        legend={
          <Legend
            items={[
              { label: 'Above average', color: 'var(--pink)' },
              { label: 'Below average', color: 'var(--blue)' },
            ]}
          />
        }
      >
        <MatchStrip matches={p.matches} role={role} />
      </ChartFrame>
    </div>
  )
}
