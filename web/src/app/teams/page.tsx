import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHead, signed } from '@/components/kit'
import { TeamBadge } from '@/components/TeamBadge'
import { getTeams } from '@/lib/data'
import { teamSlug } from '@/lib/teams'

export const metadata: Metadata = { title: 'IPL teams' }

export default function TeamsPage() {
  const data = getTeams()
  const years = [...data.seasons].reverse()
  return (
    <>
      <PageHead
        title="IPL teams"
        summary="Every IPL season since 2022. Points tables are rebuilt from the ball-by-ball data; the last two columns are what the models add: runs a match won or lost with bat and ball against an average side in the same situations."
      />
      <div className="flex flex-col gap-5">
        {years.map((y) => {
          const s = data.by_season[String(y)]
          return (
            <section key={y} className="panel overflow-x-auto" aria-labelledby={`s-${y}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3">
                <h2 id={`s-${y}`} className="display text-[1.4rem]">
                  IPL {y}
                </h2>
                {s.champion && (
                  <span className="text-[13px] text-ink-2">
                    Champions: <b className="text-foreground">{s.champion}</b>
                  </span>
                )}
              </div>
              <table className="w-full min-w-[720px] text-[13.5px]">
                <thead className="text-[12px] text-ink-3">
                  <tr className="border-b border-line">
                    <th className="py-2 pl-5 text-left font-medium">#</th>
                    <th className="py-2 text-left font-medium">Team</th>
                    <th className="py-2 text-right font-medium">P</th>
                    <th className="py-2 text-right font-medium">W</th>
                    <th className="py-2 text-right font-medium">L</th>
                    <th className="py-2 text-right font-medium">Pts</th>
                    <th className="py-2 text-right font-medium">NRR</th>
                    <th className="py-2 text-right font-medium">Batting / match</th>
                    <th className="py-2 pr-5 text-right font-medium">Bowling / match</th>
                  </tr>
                </thead>
                <tbody>
                  {s.table.map((r) => {
                    const t = s.teams[r.team]
                    return (
                      <tr key={r.team} className="border-b border-line last:border-0 hover:bg-panel-2">
                        <td className="num py-2 pl-5 text-ink-3">{r.pos}</td>
                        <td className="py-2">
                          <Link href={`/teams/${teamSlug(r.team)}/`} className="flex items-center gap-2 font-medium hover:underline">
                            <TeamBadge team={r.team} size={22} />
                            {r.team}
                          </Link>
                        </td>
                        <td className="num py-2 text-right">{r.played}</td>
                        <td className="num py-2 text-right">{r.won}</td>
                        <td className="num py-2 text-right">{r.lost}</td>
                        <td className="num py-2 text-right font-semibold">{r.points}</td>
                        <td className="num py-2 text-right text-ink-2">{signed(r.nrr, 3)}</td>
                        <td className={`num py-2 text-right ${t.summary.bat_rv_pm >= 0 ? 'text-signal-ink' : 'text-data-ink'}`}>{signed(t.summary.bat_rv_pm)}</td>
                        <td className={`num py-2 pr-5 text-right ${t.summary.bowl_rv_pm >= 0 ? 'text-signal-ink' : 'text-data-ink'}`}>{signed(t.summary.bowl_rv_pm)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>
          )
        })}
      </div>
    </>
  )
}
