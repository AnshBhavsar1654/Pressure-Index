import type { Metadata } from 'next'
import Link from 'next/link'
import { PhaseGaps, SeasonExplorer, TeamDots } from '@/components/charts/RRCharts'
import { Zoomable } from '@/components/charts/Zoom'
import { TeamBadge } from '@/components/TeamBadge'
import { OPPONENTS } from '@/lib/teams'
import { Bullets, PageHead, SectionHead, Stat, ordinal, signed } from '@/components/kit'
import { getRR } from '@/lib/data'
import { iplCode } from '@/lib/format'
import type { Gap, SquadPlayer } from '@/lib/types'
import { NewFaces } from '@/views/NewFaces'
import { SquadTables } from '@/views/SquadTables'

export const metadata: Metadata = { title: 'Rajasthan Royals, IPL 2026 review' }

const gapName = (g: Gap) => `${g.phase === 'Middle' ? 'middle-overs' : g.phase.toLowerCase()} ${g.discipline === 'bat' ? 'batting' : 'bowling'}`

export default function RajasthanPage() {
  const rr = getRR()
  const s = rr.summary
  const top = (k: 'bat' | 'bowl', f: (p: SquadPlayer) => number) => [...rr.squad].filter((p) => p[k]).sort((a, b) => f(b) - f(a))[0]
  const runs = top('bat', (p) => p.bat!.runs)
  const wkts = top('bowl', (p) => p.bowl!.wkts)
  const leaks = rr.gaps.filter((g) => g.gap_vs_avg < 0)
  const leakTotal = leaks.reduce((a, g) => a + g.gap_vs_avg, 0)
  const best = rr.gaps[rr.gaps.length - 1]
  const death = rr.phases.find((p) => p.phase === 'Death')!
  const mu = rr.matchups
  const pv = rr.provenance

  return (
    <>
      <PageHead
        title="Rajasthan Royals in IPL 2026"
        summary={`${ordinal(s.pos)} in the league with ${s.won} wins from ${s.played}. ${s.playoff_result ?? ''}.`}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Stat label="League finish" value={`${s.pos}th`} note={`${s.points} points, ${s.won} won, ${s.lost} lost`} />
        <Stat label="Net run rate" value={signed(s.nrr, 3)} note="league stage" />
        <Stat label="Playoffs" value="Q2" note={s.playoff_result ?? ''} />
        <Stat label="Most runs" value={runs.bat!.runs} tone="pink" note={`${runs.name}, strike rate ${runs.bat!.sr}`} />
        <Stat label="Most wickets" value={wkts.bowl!.wkts} tone="pink" note={`${wkts.name}, economy ${wkts.bowl!.econ}`} />
      </div>

      <section className="panel mt-5 grid gap-5 border-gold/50 bg-gold-soft/30 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div>
          <h2 className="display mb-2 text-[1.6rem]">The season in four points</h2>
          <Bullets
            items={[
              <>
                <b>Best in the league:</b> {gapName(best)}, {signed(best.gap_vs_avg)} runs a match against an average side ({ordinal(best.rank)} of 10)
              </>,
              <>
                <b>Leaks:</b> {leaks.map(gapName).join(', ')}, about {Math.abs(leakTotal).toFixed(0)} runs a match in all
              </>,
              <>
                <b>The death overs:</b> {ordinal(death.bat_rank)} of 10 batting, {ordinal(death.bowl_rank)} of 10 bowling
              </>,
              <>
                <b>Roles to fill for 2027:</b> {rr.recommendations.map((r) => r.role.toLowerCase()).join(', ')}
              </>,
            ]}
          />
        </div>
        <Link href="/picks/" className="flex min-h-11 items-center justify-center rounded-lg bg-pink px-4 font-semibold text-white hover:bg-pink-ink">
          See my picks
        </Link>
      </section>

      <SectionHead title={`All ${rr.matches.length} matches`}>
        Pick a match to see RR’s chance of winning, ball by ball. Pink shading marks pressure balls.
      </SectionHead>
      <SeasonExplorer matches={rr.matches} />

      <SectionHead title="Where matches were won and lost">
        Each ball against an average IPL 2026 side in the same situation, added up by phase.
      </SectionHead>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="panel p-5">
          <Zoomable label="runs won and lost by phase">
            <PhaseGaps phases={rr.phases} bench={rr.bench} />
          </Zoomable>
        </section>
        <div className="flex flex-col gap-4">
          <section className="panel p-4">
            <h3 className="mb-2 text-[14px] font-semibold">Reading it</h3>
            <Bullets
              className="text-[13.5px]"
              items={[
                <>
                  <b>{signed(best.gap_vs_avg)}</b> = about {best.gap_vs_avg.toFixed(0)} more runs a match than an average side from the same positions
                </>,
                'Blue bars lost runs; pink bars gained them',
                <>Black tick: the other playoff sides ({rr.bench.map(iplCode).join(', ')})</>,
                'Hover a bar for the best side in that phase too',
              ]}
            />
          </section>
          <section className="panel overflow-hidden">
            <h3 className="border-b border-line px-4 py-3 text-[14px] font-semibold">The same story in familiar numbers</h3>
            <table className="w-full text-[13px]">
              <thead className="text-[12px] text-ink-3">
                <tr className="border-b border-line">
                  <th className="px-4 py-2 text-left font-medium" />
                  <th className="px-2 py-2 text-right font-medium">RR</th>
                  <th className="px-2 py-2 text-right font-medium">League</th>
                  <th className="px-4 py-2 text-right font-medium" title={`The other playoff sides: ${rr.bench.join(', ')}`}>Other playoff sides</th>
                </tr>
              </thead>
              <tbody>
                {rr.phases.flatMap((p) => [
                  <tr key={`b${p.phase}`} className="border-b border-line">
                    <td className="px-4 py-2 text-ink-2">{p.phase} run rate (batting)</td>
                    <td className="num px-2 py-2 text-right font-semibold">{p.rr.bat_rpo.toFixed(2)}</td>
                    <td className="num px-2 py-2 text-right text-ink-2">{p.league.bat_rpo.toFixed(2)}</td>
                    <td className="num px-4 py-2 text-right text-ink-2">{p.top4.bat_rpo.toFixed(2)}</td>
                  </tr>,
                  <tr key={`w${p.phase}`} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 text-ink-2">{p.phase} economy (bowling)</td>
                    <td className="num px-2 py-2 text-right font-semibold">{p.rr.bowl_rpo.toFixed(2)}</td>
                    <td className="num px-2 py-2 text-right text-ink-2">{p.league.bowl_rpo.toFixed(2)}</td>
                    <td className="num px-4 py-2 text-right text-ink-2">{p.top4.bowl_rpo.toFixed(2)}</td>
                  </tr>,
                ])}
              </tbody>
            </table>
          </section>
        </div>
      </div>

      <SectionHead title="Pace, spin and pressure">
        RR against the other nine sides. Each dot is a team in its kit colour; zero is the league average.
      </SectionHead>
      <section className="panel grid gap-x-10 gap-y-5 p-5 md:grid-cols-2">
        <TeamDots title="Batting against pace" rows={mu.teams.map((t) => ({ team: t.team, v: t.bat_vs_pace }))} />
        <TeamDots title="Batting against spin" rows={mu.teams.map((t) => ({ team: t.team, v: t.bat_vs_spin }))} />
        <TeamDots title="RR pace bowlers" rows={mu.teams.map((t) => ({ team: t.team, v: t.bowl_pace }))} />
        <TeamDots title="RR spin bowlers" rows={mu.teams.map((t) => ({ team: t.team, v: t.bowl_spin }))} />
        <TeamDots title="Batting in pressure moments" rows={rr.pressure.teams.map((t) => ({ team: t.team, v: t.bat }))} />
        <TeamDots title="Bowling in pressure moments" rows={rr.pressure.teams.map((t) => ({ team: t.team, v: t.bowl }))} />
      </section>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 px-1 text-[12.5px] text-ink-2" aria-label="Team colours">
        <li className="flex items-center gap-1.5">
          <TeamBadge team="Rajasthan Royals" size={20} />
          <b className="text-foreground">Rajasthan Royals</b>
        </li>
        {OPPONENTS.map((t) => (
          <li key={t.code} className="flex items-center gap-1.5">
            <TeamBadge team={t.name} size={20} />
            {t.code}
          </li>
        ))}
      </ul>
      <section className="panel mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-[13.5px]">
          <caption className="px-5 pt-4 text-left text-[14px] font-semibold text-foreground">By batting position</caption>
          <thead className="text-[12.5px] text-ink-3">
            <tr className="border-b border-line">
              <th className="px-5 py-2.5 text-left font-medium">Batting order</th>
              <th className="px-3 py-2.5 text-right font-medium">Runs a match against average</th>
              <th className="px-3 py-2.5 text-right font-medium">RR strike rate</th>
              <th className="px-5 py-2.5 text-right font-medium">League strike rate</th>
            </tr>
          </thead>
          <tbody>
            {rr.order.map((o) => (
              <tr key={o.band} className="border-b border-line last:border-0">
                <td className="px-5 py-2.5">{o.band}</td>
                <td className={`num px-3 py-2.5 text-right font-semibold ${o.rv_pm >= 0 ? 'text-pink-ink' : 'text-blue'}`}>{signed(o.rv_pm)}</td>
                <td className="num px-3 py-2.5 text-right">{o.sr}</td>
                <td className="num px-5 py-2.5 text-right text-ink-2">{o.league_sr}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <SectionHead title="New faces for 2026">
        Who joined for 2026, where from, and what they delivered.
      </SectionHead>
      <NewFaces joined={rr.joined} squad={rr.squad} />

      <SectionHead title="The squad, player by player">
        Runs added against an average IPL 2026 player in the same situations, most valuable first.
      </SectionHead>
      <SquadTables squad={rr.squad} />

      <p className="mt-8 text-[13px] text-ink-3">
        Every number here is computed from the official data pack; {pv.checks_passed} of {pv.checks.length} match the public record
        exactly.{' '}
        <Link href="/sources/#checks" className="font-semibold text-pink-ink hover:underline">
          See the checks and every source
        </Link>
      </p>
    </>
  )
}
