'use client'

import { ChartFrame, Legend } from '@/components/charts/core'
import { LineChart } from '@/components/charts/LineChart'
import { ComponentBars, MatchStrip } from '@/components/charts/Profile'
import { fmt } from '@/lib/format'
import { COMPONENT_LABEL, type Player, type Role } from '@/lib/types'

export function ProfileCharts({ p, role }: { p: Player; role: Role }) {
  const seasonSeries = [
    {
      key: 'p',
      label: 'Pressure moments',
      color: 'var(--signal)',
      points: p.seasons.filter((s) => s.p_balls >= 1 && s.p_rv100 != null).map((s) => ({ x: s.season, y: s.p_rv100, n: s.p_balls })),
    },
    { key: 'n', label: 'Normal moments', color: 'var(--data)', points: p.seasons.map((s) => ({ x: s.season, y: s.n_rv100 })) },
  ]
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section className="panel p-5">
          <h2 className="display mb-1 text-[1.5rem]">The evidence</h2>
          <p className="mb-4 text-[13px] text-ink-2">The rating decides the rank; the rest show whether it holds up. The number is the share of qualified {role === 'bat' ? 'batters' : 'bowlers'} this player beats on each one.</p>
          <ComponentBars z={p.z ?? {}} beats={p.beats} labels={COMPONENT_LABEL} />
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
        subtitle="One bar per match, oldest to newest: how many percentage points this player’s pressure balls added to (orange) or took from (teal) the team’s chance of winning. A tall orange bar is a match won under pressure; a long run of orange is what consistency looks like. Hover for the runs too."
        legend={
          <Legend
            items={[
              { label: 'Above average', color: 'var(--signal)' },
              { label: 'Below average', color: 'var(--data)' },
            ]}
          />
        }
      >
        <MatchStrip matches={p.matches} role={role} />
      </ChartFrame>
    </div>
  )
}
