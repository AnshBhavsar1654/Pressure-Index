import type { Metadata } from 'next'
import { PageHead, Plain, SectionHead, Stat, StatRow } from '@/components/ui'
import { getGrid, getSummary } from '@/lib/data'
import { fmt } from '@/lib/format'
import { ChaseMap, PressureShape } from '@/views/PressureCharts'

export const metadata: Metadata = { title: 'How pressure works' }

export default function PressurePage() {
  const s = getSummary()
  const c = s.contrast
  const steps = [
    {
      t: 'Work out who is winning',
      d: 'For every ball, a model trained on all 867 matches estimates each side’s chance of winning from the score, wickets, balls left and target.',
    },
    {
      t: 'Ask what the next ball could change',
      d: 'We imagine every possible outcome (a dot, a single, a four, a six, a wicket, a wide) and see how much each would move that chance. A big possible swing means big stakes.',
    },
    {
      t: 'Keep the top fifth',
      d: `The 20% of balls with the biggest stakes are “pressure moments”. Knockout games count 1.2 times more. Everything else is a player’s normal level.`,
    },
  ]
  return (
    <>
      <PageHead
        title="How pressure works"
        takeaway="Pressure is not just the last over or a high asking rate. It is any moment where the next ball could change who wins. A tight chase is pressure; a chase that is already lost is not, however dramatic it looks."
      >
        <div className="max-w-sm">
          <Plain>
            Think of a scoreboard that shows each team’s <b>chance of winning</b>. If the next ball could move it a lot, that
            ball is high pressure. If almost nothing could move it, the game is decided and there is no pressure.
          </Plain>
        </div>
      </PageHead>

      <ol className="grid gap-px overflow-hidden rounded-[10px] border border-line bg-line md:grid-cols-3">
        {steps.map((st, i) => (
          <li key={st.t} className="flex gap-4 bg-panel p-5">
            <span className="display num text-[2.6rem] leading-none text-pink">{i + 1}</span>
            <div>
              <h2 className="text-[16px] font-semibold">{st.t}</h2>
              <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{st.d}</p>
            </div>
          </li>
        ))}
      </ol>

      <SectionHead title="Proof it works">
        The pressure label was never shown to the scoring model, yet cricket changes exactly as you would expect when the stakes
        rise.
      </SectionHead>
      <StatRow cols={4}>
        <Stat label="Wickets per 100 balls" value={c.pressure.wkt_pct.toFixed(1)} tone="pink" note={`against ${c.normal.wkt_pct.toFixed(1)} in ordinary moments`} />
        <Stat label="Wides and no-balls" value={`${c.pressure.extras_pct.toFixed(1)}%`} tone="pink" note={`against ${c.normal.extras_pct.toFixed(1)}%: bowlers feel it too`} />
        <Stat label="Dot balls" value={`${c.pressure.dot_pct.toFixed(0)}%`} tone="pink" note={`against ${c.normal.dot_pct.toFixed(0)}%`} />
        <Stat label="Pressure moments found" value={fmt.int(c.pressure.balls)} note={`out of ${fmt.int(s.n_balls)} deliveries`} />
      </StatRow>

      <div className="mt-6 flex flex-col gap-6">
        <ChaseMap grid={getGrid()} />
        <PressureShape s={s} />
      </div>

      <SectionHead title="The tensest balls in five years of data">
        Each is the single highest-stakes ball of its match. Almost all are last-ball finishes, which is exactly what a
        pressure measure should find.
      </SectionHead>
      <section className="panel overflow-x-auto">
        <table className="w-full min-w-[760px] text-[13.5px]">
          <thead className="text-left text-[12.5px] text-ink-3">
            <tr className="border-b border-line">
              <th className="px-5 py-2.5 font-medium">Match</th>
              <th className="px-3 py-2.5 font-medium">Situation</th>
              <th className="px-3 py-2.5 font-medium">Batter v bowler</th>
              <th className="px-3 py-2.5 text-right font-medium">Chasing side’s win chance</th>
              <th className="px-5 py-2.5 text-right font-medium">Stakes (× typical ball)</th>
            </tr>
          </thead>
          <tbody>
            {s.moments.slice(0, 10).map((mo) => (
              <tr key={mo.match + mo.date} className="border-b border-line last:border-0">
                <td className="px-5 py-2.5">
                  <div className="font-semibold">{mo.match}</div>
                  <div className="text-[12px] text-ink-3">
                    {mo.comp}, {fmt.date(mo.date)}
                  </div>
                </td>
                <td className="px-3 py-2.5">{mo.state}</td>
                <td className="px-3 py-2.5">
                  {mo.striker} v {mo.bowler}
                </td>
                <td className="num px-3 py-2.5 text-right">{fmt.pct(mo.wp)}</td>
                <td className="display num px-5 py-2.5 text-right text-[1.4rem] text-pink">{mo.li.toFixed(0)}×</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}
