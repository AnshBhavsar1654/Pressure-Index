'use client'

import Link from 'next/link'
import { useState } from 'react'
import { PhaseGaps, SeasonStrip } from '@/components/charts/TeamCharts'
import { ChartFrame } from '@/components/charts/core'
import { Segmented } from '@/components/filters'
import { ordinal, signed, Stat } from '@/components/kit'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { TeamSeason } from '@/lib/types'

export type TeamSeasons = Record<string, { season: TeamSeason; nTeams: number; champion: string | null }>

/** One franchise across seasons, with a season switch. */
export function TeamSeasonView({ team, seasons }: { team: string; seasons: TeamSeasons }) {
  const years = Object.keys(seasons).sort().reverse()
  const [yr, setYr] = useState(years[0])
  const { season: t, nTeams, champion } = seasons[yr]
  const s = t.summary
  const p = t.pressure
  return (
    <div className="flex flex-col gap-5">
      <Segmented label="Season" value={yr} onChange={setYr} options={years.map((y) => ({ value: y, label: y }))} className="w-fit" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="League position" value={s.pos ? ordinal(s.pos) : '–'} note={`${s.won} won, ${s.lost} lost${s.nr ? `, ${s.nr} no result` : ''}${champion === team ? ' · champions' : ''}`} tone={champion === team ? 'signal' : 'ink'} />
        <Stat label="Net run rate" value={signed(s.nrr, 3)} note={`${s.points} points`} />
        <Stat label="Batting, runs a match" value={signed(s.bat_rv_pm)} note="against an average side, same situations" />
        <Stat label="Bowling, runs a match" value={signed(s.bowl_rv_pm)} note="runs saved against an average side" />
      </div>
      <ChartFrame
        title="Where runs were won and lost"
        subtitle={`Runs per match against an average IPL ${yr} side in the same situations, by phase. Each ball is already context-adjusted, so this is skill, not just scoring rate.`}
      >
        <PhaseGaps phases={t.phases} nTeams={nTeams} />
      </ChartFrame>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h3 className="mb-3 text-[15px] font-semibold">Under pressure</h3>
          <dl className="grid grid-cols-2 gap-3">
            <Stat label="Batting, per 100 pressure balls" value={signed(p.bat_rv100)} />
            <Stat label="Bowling, per 100 pressure balls" value={signed(p.bowl_rv100)} />
          </dl>
          <p className="mt-3 text-[12.5px] text-ink-3">{p.balls_pm} pressure balls a match, batting and bowling together.</p>
        </div>
        <div className="panel overflow-x-auto p-5">
          <h3 className="mb-3 text-[15px] font-semibold">Batting order</h3>
          <table className="w-full min-w-[380px] text-[13px]">
            <thead className="text-[12px] text-ink-3">
              <tr className="border-b border-line">
                <th className="py-1.5 text-left font-medium">Band</th>
                <th className="py-1.5 text-right font-medium">Balls a match</th>
                <th className="py-1.5 text-right font-medium">Strike rate</th>
                <th className="py-1.5 text-right font-medium">League</th>
                <th className="py-1.5 text-right font-medium">Runs a match</th>
              </tr>
            </thead>
            <tbody>
              {t.order.map((o) => (
                <tr key={o.band} className="border-b border-line last:border-0">
                  <td className="py-1.5">{o.band}</td>
                  <td className="num py-1.5 text-right">{o.balls_pm}</td>
                  <td className="num py-1.5 text-right">{o.sr}</td>
                  <td className="num py-1.5 text-right text-ink-3">{o.league_sr}</td>
                  <td className="num py-1.5 text-right font-semibold">{signed(o.rv_pm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-[15px] font-semibold">Every match</h3>
        <SeasonStrip matches={t.matches} team={team} />
      </div>
      <div className="panel overflow-x-auto pb-0">
        <h3 className="px-5 pt-4 text-[15px] font-semibold">Squad contributions</h3>
        <p className="px-5 text-[12.5px] text-ink-3">Runs added with the bat plus runs saved with the ball, against an average player in the same situations.</p>
        <Table className="mt-2 min-w-[720px] text-[13px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Player</TableHead>
              <TableHead className="text-right">Matches</TableHead>
              <TableHead className="text-right">Runs (SR)</TableHead>
              <TableHead className="text-right">Wkts (econ)</TableHead>
              <TableHead className="text-right">Pressure, bat</TableHead>
              <TableHead className="text-right">Pressure, ball</TableHead>
              <TableHead className="pr-5 text-right">Total runs added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {t.squad.map((x) => (
              <TableRow key={x.id}>
                <TableCell className="pl-5 font-medium">
                  <Link href={`/players/${(x.bat?.balls ?? 0) >= (x.bowl?.balls ?? 0) ? 'bat' : 'bowl'}/${x.id}/`} className="hover:underline">
                    {x.name}
                  </Link>
                </TableCell>
                <TableCell className="num text-right">{x.matches}</TableCell>
                <TableCell className="num text-right">{x.bat ? `${x.bat.runs} (${x.bat.sr})` : '–'}</TableCell>
                <TableCell className="num text-right">{x.bowl ? `${x.bowl.wkts} (${x.bowl.econ.toFixed(2)})` : '–'}</TableCell>
                <TableCell className="num text-right text-ink-2">{x.bat?.p_rv100 != null && x.bat.p_balls >= 20 ? signed(x.bat.p_rv100) : '–'}</TableCell>
                <TableCell className="num text-right text-ink-2">{x.bowl?.p_rv100 != null && x.bowl.p_balls >= 20 ? signed(x.bowl.p_rv100) : '–'}</TableCell>
                <TableCell className={`num pr-5 text-right font-semibold ${x.rv >= 0 ? 'text-signal-ink' : 'text-data-ink'}`}>{signed(x.rv)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
