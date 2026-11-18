import { CheckCircle, XCircle } from '@phosphor-icons/react/dist/ssr'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PhaseGaps, SeasonExplorer, TeamDots } from '@/components/charts/RRCharts'
import { Zoomable } from '@/components/charts/Zoom'
import { TeamBadge } from '@/components/TeamBadge'
import { OPPONENTS } from '@/lib/teams'
import { Tag, PageHead, Note, SectionHead, Stat, ordinal, signed } from '@/components/kit'
import { getRR } from '@/lib/data'
import { fmt, iplCode } from '@/lib/format'
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
        summary={
          <>
            Fourth in the league with {s.won} wins from {s.played}, then a win in the Eliminator and defeat in Qualifier 2. The{' '}
            {gapName(best)} was the best in the league. The leaks were {leaks.map(gapName).join(', ')}: together about{' '}
            <b className="text-ink">{Math.abs(leakTotal).toFixed(0)} runs a match</b> lost to an average side.
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Stat label="League finish" value={`${s.pos}th`} note={`${s.points} points, ${s.won} won, ${s.lost} lost`} />
        <Stat label="Net run rate" value={signed(s.nrr, 3)} note="league stage" />
        <Stat label="Playoffs" value="Q2" note={s.playoff_result ?? ''} />
        <Stat label="Most runs" value={runs.bat!.runs} tone="pink" note={`${runs.name}, strike rate ${runs.bat!.sr}`} />
        <Stat label="Most wickets" value={wkts.bowl!.wkts} tone="pink" note={`${wkts.name}, economy ${wkts.bowl!.econ}`} />
      </div>

      <SectionHead title="All 16 matches">
        Pick a match to see how RR’s chance of winning moved ball by ball. Pink shading marks pressure moments.
      </SectionHead>
      <SeasonExplorer matches={rr.matches} />

      <SectionHead title="Where matches were won and lost">
        Every ball RR played is compared with what an average IPL 2026 side would have scored or conceded in exactly the same
        situation. Adding it up by phase shows where RR gained and leaked runs. The black tick is the average of the other three
        playoff sides ({rr.bench.map(iplCode).join(', ')}). That is not the same as the best sides in each phase: some teams that
        missed the playoffs were strong in one phase, so RR can beat the playoff average and still rank lower. Hover a bar for both.
      </SectionHead>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="panel p-5">
          <Zoomable label="runs won and lost by phase">
            <PhaseGaps phases={rr.phases} bench={rr.bench} />
          </Zoomable>
        </section>
        <div className="flex flex-col gap-4">
          <Note title="Reading it">
            <b>{signed(best.gap_vs_avg)}</b> next to {gapName(best)} means RR scored about {best.gap_vs_avg.toFixed(0)} more runs
            a match in that phase than an average team would have from the same positions. The blue bars are the problem: at the
            death RR ranked {ordinal(death.bat_rank)} of 10 batting and {ordinal(death.bowl_rank)} bowling.
          </Note>
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
        Where RR sit among the ten IPL sides. Every other team is a dot in its kit colour (hover for the name); zero is the league average.
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
        Players who joined Rajasthan Royals for this season, with where they came from and what they delivered.
      </SectionHead>
      <NewFaces joined={rr.joined} squad={rr.squad} />

      <SectionHead title="The squad, player by player">
        Runs added compared with an average IPL 2026 player in the same situations, over the whole season. Sorted from most to
        least valuable.
      </SectionHead>
      <SquadTables squad={rr.squad} />

      <section className="panel mt-6 flex flex-wrap items-center justify-between gap-4 border-gold/50 bg-gold-soft/40 p-5">
        <div className="max-w-[70ch]">
          <h2 className="display text-[1.7rem]">What to fix for 2027</h2>
          <p className="text-[14px] text-ink-2">
            RR leaked runs against an average side, or trailed the other playoff sides, in {rr.recommendations.length} roles:{' '}
            {rr.recommendations.map((r) => r.role.toLowerCase()).join(', ')}. My picks puts the top-10 players who fill
            these gaps first.
          </p>
        </div>
        <Link href="/picks/" className="flex min-h-11 items-center rounded-lg bg-pink px-4 font-semibold text-white hover:bg-pink-ink">
          See my picks
        </Link>
      </section>

      <SectionHead title="Where this data comes from" id="sources">
        Every number on this page is computed from the official SupeRR Selector data pack, then checked against the public
        record. Nothing is typed in by hand.
      </SectionHead>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel overflow-hidden">
          <h3 className="border-b border-line px-5 py-3 text-[14.5px] font-semibold">Source files (SupeRR Selector Season 2 data pack)</h3>
          <ul className="divide-y divide-line text-[13.5px]">
            {pv.files.map((f) => (
              <li key={f.file} className="flex flex-col gap-0.5 px-5 py-2.5">
                <span className="font-mono text-[12.5px] font-semibold text-ink">{f.file}</span>
                <span className="text-ink-2">
                  {f.use}
                  {f.rows != null && <span className="text-ink-3"> ({fmt.int(f.rows)} rows used)</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-5 py-3 text-[12.5px] leading-relaxed text-ink-3">
            IPL 2026 is competition {pv.comp_id}: {pv.league_matches} matches and {fmt.int(pv.league_balls)} deliveries in total.
            RR match ids: {pv.match_ids.join(', ')}.
          </p>
        </section>
        <section className="panel overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3">
            <h3 className="text-[14.5px] font-semibold">Checked against the public record</h3>
            <Tag tone={pv.checks_passed === pv.checks.length ? 'pink' : 'blue'}>
              {pv.checks_passed} of {pv.checks.length} match exactly
            </Tag>
          </div>
          <table className="w-full text-[13px]">
            <thead className="text-[12px] text-ink-3">
              <tr className="border-b border-line">
                <th className="px-5 py-2 text-left font-medium">Figure</th>
                <th className="px-2 py-2 text-right font-medium">Public record</th>
                <th className="px-2 py-2 text-right font-medium">My figure</th>
                <th className="px-5 py-2 text-right font-medium">
                  <span className="sr-only">Match</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pv.checks.map((c) => (
                <tr key={c.item} className="border-b border-line last:border-0">
                  <td className="px-5 py-1.5 text-ink-2">{c.item}</td>
                  <td className="num px-2 py-1.5 text-right">{c.public}</td>
                  <td className="num px-2 py-1.5 text-right font-semibold">{c.ours}</td>
                  <td className="px-5 py-1.5 text-right">
                    {c.match ? (
                      <CheckCircle size={17} weight="fill" className="ml-auto text-pink" aria-label="matches" />
                    ) : (
                      <XCircle size={17} weight="fill" className="ml-auto text-blue" aria-label="differs" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line px-5 py-3 text-[12.5px] text-ink-3">
            Reference:{' '}
            <a href={pv.reference.url} className="font-semibold text-pink-ink hover:underline" target="_blank" rel="noreferrer">
              {pv.reference.name}
            </a>
            , accessed {fmt.date(pv.reference.accessed)}.
          </p>
        </section>
      </div>
    </>
  )
}
