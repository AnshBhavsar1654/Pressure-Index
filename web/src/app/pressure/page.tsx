import type { Metadata } from 'next'
import { PageHead, Note, SectionHead, Stat} from '@/components/kit'
import { getGrid, getSummary } from '@/lib/data'
import { fmt } from '@/lib/format'
import { MomentsTable } from '@/views/MomentsTable'
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
      d: 'I imagine every possible outcome (a dot, a single, a four, a six, a wicket, a wide) and see how much each would move that chance. A big possible swing means big stakes.',
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
        summary="A ball is high pressure when it could change who wins. That covers a tight finish, an early collapse or a close chase in the middle overs, and it leaves out a chase that is already lost, however dramatic it looks."
      >
        <div className="max-w-sm">
          <Note title="The idea">
            Think of a scoreboard that shows each team’s <b>chance of winning</b>. If the next ball could move it a lot, that
            ball is high pressure. If almost nothing could move it, the game is decided and there is no pressure.
          </Note>
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <Stat label="Wickets per 100 balls" value={c.pressure.wkt_pct.toFixed(1)} tone="pink" note={`against ${c.normal.wkt_pct.toFixed(1)} in normal moments`} />
        <Stat label="Wides and no-balls" value={`${c.pressure.extras_pct.toFixed(1)}%`} tone="pink" note={`against ${c.normal.extras_pct.toFixed(1)}%: bowlers feel it too`} />
        <Stat label="Dot balls" value={`${c.pressure.dot_pct.toFixed(0)}%`} tone="pink" note={`against ${c.normal.dot_pct.toFixed(0)}%`} />
        <Stat label="Pressure moments found" value={fmt.int(c.pressure.balls)} note={`out of ${fmt.int(s.n_balls)} deliveries`} />
      </div>

      <div className="mt-6 flex flex-col gap-6">
        <ChaseMap grid={getGrid()} />
        <PressureShape s={s} />
      </div>

      <SectionHead title="The tensest balls in five years of data">
        The single highest-stakes ball of each match. Almost all are last-ball finishes, which is exactly what a
        pressure measure should find.
      </SectionHead>
      <MomentsTable moments={s.moments} />
    </>
  )
}
