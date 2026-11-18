import Link from 'next/link'
import type { ReactNode } from 'react'
import { Term } from '@/components/Term'
import { fmt } from '@/lib/format'
import { winPts } from '@/lib/terms'

export interface Example {
  id: number
  name: string
  ball: {
    match: string; comp: string; date: string; over: string; score: string; need: number | null; balls_left: number
    knockout: boolean; wp: number; wp_after: number; stakes: number; runs: number; out: number
    expected: number; wkt_cost: number; centre: number; rv: number
  }
  seasons: { season: number; weight: number; p_balls: number; p_runs: number; n_balls: number; n_runs: number }[]
  steps: {
    K: number
    p_balls: number; p_matches: number; p_weighted: number; p_sum: number; p_raw100: number
    n_balls: number; n_weighted: number; n_sum: number; n_raw100: number; n_rv100: number; n_keep: number
    share: number; rating100: number; lift100: number
    wpa_sum: number; wpa100: number; c_pos: number; c_n: number
    recent_balls: number; recent100: number; recent_from: number
  }
  rank: number
  merit_rank: number
  n_qualified: number
  n_ranked: number
  next: { rank: number; name: string; rating: number }[]
  boot: { p_top10: number; rank_med: number; rank_lo: number; rank_hi: number }
  press: { sr: number }
  norm: { sr: number }
}

const sg = (n: number, d = 1) => fmt.signed(n, d)

/** One calculation: what it means in words, then the sum with the real numbers. */
function Step({ n, title, children, sum }: { n: number; title: string; children: ReactNode; sum: ReactNode }) {
  return (
    <li className="grid gap-3 bg-panel p-5 md:grid-cols-[3rem_minmax(0,1fr)_minmax(0,1.1fr)] md:gap-6">
      <span className="display num text-[2.4rem] leading-none text-pink">{n}</span>
      <div>
        <h3 className="text-[16px] font-semibold">{title}</h3>
        <div className="mt-1 text-[14px] leading-relaxed text-ink-2 [&_b]:text-ink">{children}</div>
      </div>
      <div className="num rounded-lg bg-panel-2 px-4 py-3 text-[14px] leading-relaxed text-ink-2 [&_b]:text-ink">
        <span className="mb-1 block text-[12.5px] font-semibold text-blue">The numbers</span>
        {sum}
      </div>
    </li>
  )
}

/** The top-ranked batter's rating rebuilt from one ball to the final rank, with every figure shown. */
export function WorkedExample({ e, threshold }: { e: Example; threshold: number }) {
  const s = e.steps
  const b = e.ball
  const who = e.name
  const shot = b.runs === 6 ? 'a six' : b.runs === 4 ? 'a four' : `${b.runs}`
  return (
    <ol className="flex flex-col gap-px overflow-hidden rounded-[10px] border border-line bg-line">
      <Step
        n={1}
        title="Is this a pressure ball?"
        sum={
          <>
            Chance of winning before the ball: <b>{fmt.pct(b.wp)}</b>
            <br />
            Stakes: the next ball could swing that by <b>{b.stakes}×</b> as much as a typical ball
            <br />
            The pressure line (top 20% of balls) is {threshold.toFixed(2)}×, so: <b>pressure ball</b>
          </>
        }
      >
        {b.match}, {fmt.date(b.date)}. Over {b.over}, {b.score}
        {b.need != null ? `, ${b.need} needed off ${b.balls_left}` : ''}. The win-probability model reads the scoreboard. Then it
        imagines every possible next ball (dot, single, two, four, six, wicket, wide) and measures how far each would move the chance
        of winning. A big possible swing means big stakes.
      </Step>
      <Step
        n={2}
        title="What did that ball add?"
        sum={
          <>
            {b.runs} runs scored − {b.expected.toFixed(2)} an average batter gets from here
            {b.out ? ` − ${b.wkt_cost.toFixed(2)} for the wicket` : ''} {b.centre >= 0 ? '+' : '−'} {Math.abs(b.centre).toFixed(2)} for the
            conditions = <b>{sg(b.rv, 2)} runs added</b>
            <br />
            Chance of winning: {fmt.pct(b.wp)} → <b>{fmt.pct(b.wp_after)}</b>
          </>
        }
      >
        {who} hit {shot}
        {b.out ? ' and was out' : ''}. An average batter makes {b.expected.toFixed(2)} runs from that exact spot (balls left, wickets
        down, competition, season), so that is what the ball is judged against. A wicket would have been charged at the runs it costs
        from there. A small adjustment makes the average ball worth exactly 0 in each season, and for a T20I also in that host
        country and against that opponent, so a run on a slow pitch or against a weak attack is valued fairly.
      </Step>
      <Step
        n={3}
        title="Add up every pressure ball, newest counting most"
        sum={
          <span className="grid gap-0.5">
            {e.seasons
              .filter((x) => x.p_balls > 0)
              .map((x) => (
                <span key={x.season}>
                  {x.season}: {x.p_balls} balls, {sg(x.p_runs)} runs × {x.weight}
                </span>
              ))}
            <span className="mt-1">
              Total: <b>{sg(s.p_sum)} runs</b> from {s.p_balls} balls that count as <b>{s.p_weighted}</b>
            </span>
            <span>
              Raw: {sg(s.p_sum)} ÷ {s.p_weighted} × 100 = <b>{sg(s.p_raw100)}</b> per 100 pressure balls
            </span>
          </span>
        }
      >
        The same sum for all {fmt.int(s.p_balls)} of {who}’s pressure balls in {s.p_matches} matches, in the IPL and in T20Is between
        full-member nations. Each year back counts 20% less (2026 in full, 2025 at 0.8, down to 2022 at 0.2), because an auction buys
        2027 form.
      </Step>
      <Step
        n={4}
        title="Find the usual level"
        sum={
          <>
            Other balls: {sg(s.n_sum)} runs from {fmt.int(s.n_balls)} balls that count as {s.n_weighted}
            <br />
            {sg(s.n_sum)} ÷ ({s.n_weighted} + {s.K}) × 100 = <b>{sg(s.n_rv100)}</b> per 100 balls
            <br />
            <span className="text-ink-3">
              (raw {sg(s.n_raw100)}; {s.K} average balls are added so a short record cannot look extreme)
            </span>
          </>
        }
      >
        The identical sum over every ball that was <i>not</i> a pressure ball tells us how good {who} normally is. This is the
        baseline the brief asks for: performance under pressure is always set against the player’s usual level.
      </Step>
      <Step
        n={5}
        title="The pressure rating: one formula"
        sum={
          <>
            (pressure runs + {s.K} × usual level) ÷ (pressure balls + {s.K})
            <br />= ({sg(s.p_sum)} + {s.K} × {(s.n_rv100 / 100).toFixed(3)}) ÷ ({s.p_weighted} + {s.K}) × 100 ={' '}
            <b>{sg(s.rating100)}</b>
            <br />
            {who}’s own pressure record makes up {fmt.pct(s.share)} of it: {s.p_weighted} ÷ ({s.p_weighted} + {s.K})
          </>
        }
      >
        Until a player has a long pressure record, assume he plays as he usually does. Every pressure ball then moves the estimate
        towards what he actually did. At {s.K} pressure balls it is half and half, and the record takes over after that. This one
        step is what stops a short hot streak from topping the list.
      </Step>
      <Step
        n={6}
        title="Does he rise or dip?"
        sum={
          <>
            <Term k="lift">Lift</Term> = rating − usual level = {sg(s.rating100)} − {sg(s.n_rv100)} = <b>{sg(s.lift100)}</b>
            <br />
            Positive, so he is better under pressure than usual: <b>can be recommended</b>
          </>
        }
      >
        The brief asks who rises to the occasion and who dips. A player with a negative lift is never recommended, however good his
        usual level is.
      </Step>
      <Step
        n={7}
        title="Rank and stress-test"
        sum={
          <span className="grid gap-0.5">
            <span>
              <b>1.</b> {who} {sg(s.rating100)}
            </span>
            {e.next.map((x) => (
              <span key={x.name}>
                {x.rank}. {x.name} {sg(x.rating)}
              </span>
            ))}
            <span className="mt-1">
              Top 10 in <b>{fmt.pct(e.boot.p_top10)}</b> of 400 re-runs on reshuffled matches; 9 times in 10 between {e.boot.rank_lo} and{' '}
              {e.boot.rank_hi}
            </span>
          </span>
        }
      >
        Players are ranked by the rating alone. Among the {e.n_ranked} qualified batters RR could buy who rise under pressure, {who}{' '}
        is first; among all {e.n_qualified} qualified batters, including those already retained, he would be {e.merit_rank}. Then the
        whole ranking is re-run 400 times on resampled matches, to check the pick does not hang on a few lucky games.
      </Step>
      <li className="bg-panel px-5 py-4 text-[14px] leading-relaxed text-ink-2">
        <b className="text-ink">Shown beside the rating, not part of it:</b> <Term k="winImpact">win impact</Term> {winPts(s.wpa100)} per 100
        pressure balls; <Term k="consistency">consistency</Term> {s.c_pos} of {s.c_n} pressure innings above average;{' '}
        <Term k="recentForm">recent form</Term> {sg(s.recent100)} over {s.recent_balls} pressure balls in {s.recent_from}–26. Plain
        numbers agree: strike rate {fmt.dec(e.press.sr, 0)} under pressure against {fmt.dec(e.norm.sr, 0)} normally.{' '}
        <Link href={`/players/bat/${e.id}/`} className="font-semibold text-pink-ink hover:underline">
          Open {who}’s full profile
        </Link>
      </li>
    </ol>
  )
}
