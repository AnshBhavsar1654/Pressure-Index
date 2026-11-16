import Link from 'next/link'
import type { ReactNode } from 'react'
import { Term } from '@/components/Term'
import { fmt } from '@/lib/format'
import { winPts } from '@/lib/terms'
import { COMPONENT_LABEL, type ComponentKey } from '@/lib/types'

export interface Example {
  id: number
  name: string
  ball: {
    match: string; comp: string; date: string; over: string; score: string; need: number | null; balls_left: number
    wp: number; stakes: number; runs: number; out: number; expected: number; wkt_cost: number; rv: number; centre: number
  }
  steps: {
    p_balls: number; p_matches: number; n_balls: number; p_weighted: number; n_weighted: number
    p_raw100: number; n_raw100: number; league100: number; kn: number; kp: number; n_keep: number; n_rv100: number
    gap100: number; p_keep: number; delta100: number; p_rv100: number; wpa_raw100: number; wpa100: number
    c_n: number; c_pos: number; c_prior: number; cons: number
  }
  blend: { key: ComponentKey; value: number; mean: number; sd: number; z: number; weight: number; part: number }[]
  score: number
  rank: number
  n_qualified: number
  n_ranked: number
  boot: { p_top10: number; rank_med: number; rank_lo: number; rank_hi: number }
  press: { sr: number }
  norm: { sr: number }
}

const sg = (n: number, d = 1) => fmt.signed(n, d)
/** a second term in a sum: "+ 18.6" or "− 1.7", never "+ +18.6" */
const op = (n: number, d = 1) => `${n < 0 ? '−' : '+'} ${Math.abs(n).toFixed(d)}`
const minus = (n: number, d = 1) => `${n < 0 ? '+' : '−'} ${Math.abs(n).toFixed(d)}`

/** One calculation: what it means in words, then the sum with the real numbers. */
function Step({ n, title, children, sum }: { n: number; title: string; children: ReactNode; sum: ReactNode }) {
  return (
    <li className="grid gap-3 bg-panel p-5 md:grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] md:gap-6">
      <span className="display num text-[2.4rem] leading-none text-pink">{n}</span>
      <div>
        <h3 className="text-[16px] font-semibold">{title}</h3>
        <p className="mt-1 text-[14px] leading-relaxed text-ink-2 [&_b]:text-ink">{children}</p>
      </div>
      <div className="num rounded-lg bg-panel-2 px-4 py-3 text-[14px] leading-relaxed text-ink-2 [&_b]:text-ink">
        <span className="mb-1 block text-[12.5px] font-semibold text-blue">The numbers</span>
        {sum}
      </div>
    </li>
  )
}

/** The top-ranked batter's rating rebuilt from one ball to the final rank, with every figure shown. */
export function WorkedExample({ e }: { e: Example }) {
  const s = e.steps
  const b = e.ball
  const last = e.name.split(' ').slice(-1)[0]
  return (
    <ol className="flex flex-col gap-px overflow-hidden rounded-[10px] border border-line bg-line">
      <Step
        n={1}
        title="Score one ball against the situation"
        sum={
          <>
            {b.runs} runs scored − {b.expected.toFixed(2)} expected{b.out ? ` − ${b.wkt_cost.toFixed(2)} for the wicket` : ''} +{' '}
            {b.centre.toFixed(2)} season adjustment ≈ <b>{sg(b.rv, 2)} runs added</b>
          </>
        }
      >
        {b.match}, {fmt.date(b.date)}. Over {b.over}, {b.score}
        {b.need != null ? `, ${b.need} needed off ${b.balls_left}` : ''}. The batting side’s chance of winning was {fmt.pct(b.wp)}, and
        this ball carried <b>{b.stakes}×</b> the stakes of a typical ball, so it is a pressure ball. An average batter gets{' '}
        {b.expected.toFixed(2)} runs from that spot. {last} hit {b.runs === 6 ? 'a six' : b.runs === 4 ? 'a four' : `${b.runs}`}
        {b.out ? ' and was out' : ''}. A tiny adjustment makes the average ball of each season worth exactly 0.
      </Step>
      <Step
        n={2}
        title="Add up every pressure ball"
        sum={
          <>
            {fmt.int(s.p_balls)} balls count as <b>{s.p_weighted}</b> after weighting
            <br />
            Raw level under pressure: <b>{sg(s.p_raw100)}</b> runs per 100 balls
            <br />
            Raw level in normal moments: <b>{sg(s.n_raw100)}</b> ({fmt.int(s.n_balls)} balls)
          </>
        }
      >
        The same sum for all {fmt.int(s.p_balls)} of {last}’s pressure balls in {s.p_matches} matches, and for every normal ball. Older seasons
        and weaker competitions count for less (2026 counts fully, 2022 counts 60%), so the balls are weighted before they are
        averaged.
      </Step>
      <Step
        n={3}
        title="Be careful with small samples"
        sum={
          <>
            Normal: {s.n_weighted} ÷ ({s.n_weighted} + {s.kn}) = keep {fmt.pct(s.n_keep)} of the raw figure → <b>{sg(s.n_rv100)}</b>
            <br />
            Lift: raw gap {sg(s.p_raw100)} {minus(s.n_raw100)} = {sg(s.gap100)}
            <br />
            {s.p_weighted} ÷ ({s.p_weighted} + {s.kp}) = keep {fmt.pct(s.p_keep)} → <b>{sg(s.delta100)}</b>
          </>
        }
      >
        A hot streak over a few balls proves little, so every figure is pulled towards average until there is enough evidence.
        The normal level is blended with the league average as if {s.kn} average balls were added. The <Term k="lift">lift</Term>{' '}
        under pressure is treated with more caution, as if {s.kp} balls of “no difference” were added, because pressure samples are
        smaller. The more balls a player has, the more of the raw figure they keep.
      </Step>
      <Step
        n={4}
        title="Build the four ingredients"
        sum={
          <>
            <Term k="underPressure">Under pressure</Term>: {sg(s.n_rv100)} {op(s.delta100)} = <b>{sg(s.p_rv100)}</b>
            <br />
            <Term k="winImpact">Win impact</Term>: {(s.wpa_raw100 * 100).toFixed(1)} pts × {fmt.pct(s.p_keep)} = <b>{winPts(s.wpa100)}</b>
            <br />
            <Term k="consistency">Consistency</Term>: ({s.c_pos} + 8 × {s.c_prior}) ÷ ({s.c_n} + 8) = <b>{fmt.pct(s.cons)}</b>
          </>
        }
      >
        Under pressure is the normal level plus the lift. Win impact adds up how much each pressure ball moved the team’s chance
        of winning, with the same caution. Consistency counts the pressure innings of 6 balls or more where {last} beat the average:{' '}
        {s.c_pos} of {s.c_n}, again nudged towards the typical player.
      </Step>
      <Step
        n={5}
        title="Compare with every qualified batter"
        sum={
          <span className="grid gap-0.5">
            {e.blend.map((x) => (
              <span key={x.key}>
                {COMPONENT_LABEL[x.key]}: ({x.key === 'impact' ? winPts(x.value) : x.key === 'consistency' ? fmt.pct(x.value) : sg(x.value)} −
                average {x.key === 'impact' ? winPts(x.mean) : x.key === 'consistency' ? fmt.pct(x.mean) : sg(x.mean)}) ÷ spread{' '}
                {x.key === 'impact' ? winPts(x.sd).replace('+', '') : x.key === 'consistency' ? fmt.pct(x.sd, 1) : x.sd.toFixed(1)} ={' '}
                {x.z.toFixed(2)}, × {Math.round(x.weight * 100)}% = {x.part.toFixed(2)}
              </span>
            ))}
            <span className="mt-1">
              Total: <b>{e.score.toFixed(2)}</b>, the highest of the {e.n_ranked} batters RR could sign
            </span>
          </span>
        }
      >
        The four ingredients are on different scales, so each one becomes “how far above the average of the {e.n_qualified}{' '}
        qualified batters, measured in typical gaps between players”. Then they are blended: 40% under pressure, 20% each for win
        impact, lift and consistency. The biggest blend wins.
      </Step>
      <Step
        n={6}
        title="Stress-test the rank"
        sum={
          <>
            Typical rank across re-runs: <b>{e.boot.rank_med}</b>
            <br />9 times in 10 between <b>{e.boot.rank_lo}</b> and <b>{e.boot.rank_hi}</b>
            <br />
            In the top 10: <b>{fmt.pct(e.boot.p_top10)}</b> of 400 re-runs
          </>
        }
      >
        Would {last} still rank highly with a different run of matches? The whole ranking is re-run 400 times, each time on a
        reshuffled set of matches. {last} stays in the top 10 in {fmt.pct(e.boot.p_top10)} of them, so the pick does not hang on a few
        lucky games. The typical re-run rank ({e.boot.rank_med}) sits below the actual rank ({e.rank}) because the top of the list is tight: a
        handful of batters are close enough to swap places when the matches change.
      </Step>
      <li className="bg-panel px-5 py-4 text-[14px] text-ink-2">
        Plain numbers agree: {last} strikes at {fmt.dec(e.press.sr, 0)} under pressure against {fmt.dec(e.norm.sr, 0)} normally.{' '}
        <Link href={`/players/bat/${e.id}/`} className="font-semibold text-pink-ink hover:underline">
          Open {last}’s full profile
        </Link>
      </li>
    </ol>
  )
}
