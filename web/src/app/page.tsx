import Link from 'next/link'
import { WinWorm } from '@/components/charts/WinWorm'
import { Badge, SectionHead, signed } from '@/components/ui'
import { getRole, getRR, getSummary } from '@/lib/data'
import { fmt, iplCode } from '@/lib/format'
import type { Player, Role } from '@/lib/types'

export default function Overview() {
  const s = getSummary()
  const rr = getRR()
  const bat = getRole('bat').players
  const bowl = getRole('bowl').players
  // Hero: RR's 2026 win with the most high-pressure balls (the tensest win of the season)
  const hero = [...rr.matches].filter((m) => m.won).sort((a, b) => b.pressure_balls - a.pressure_balls)[0]
  const first = hero.scores['1']
  const second = hero.scores['2']
  const worst = rr.gaps[0]
  const best = rr.gaps[rr.gaps.length - 1]
  const phaseName = (g: typeof worst) => `${g.phase === 'Middle' ? 'middle-overs' : g.phase.toLowerCase()} ${g.discipline === 'bat' ? 'batting' : 'bowling'}`

  return (
    <div className="flex flex-col">
      <section className="panel overflow-hidden">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:gap-10">
          <div className="flex flex-col justify-between gap-6">
            <div className="flex flex-col gap-4">
              <h1 className="display text-[2.9rem] text-ink sm:text-[3.6rem]">Who delivers when the match is on the line?</h1>
              <p className="text-[15.5px] leading-relaxed text-ink-2">
                The line on the right is Rajasthan Royals’ chance of winning, ball by ball, in their tensest win of 2026:{' '}
                <b className="text-ink">v {hero.opp}</b>, {fmt.date(hero.date)}. The pink stripes mark the moments where one
                ball could swing the result.
              </p>
              <p className="text-[15.5px] leading-relaxed text-ink-2">
                We found those moments in all {fmt.int(s.n_balls)} deliveries of IPL and T20I cricket since 2022, then
                rated every player on what they did in them.
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-4 border-t border-line pt-4">
              <div>
                <dt className="text-[12.5px] text-ink-3">Deliveries rated</dt>
                <dd className="display num text-[1.9rem]">{(s.n_balls / 1000).toFixed(0)}k</dd>
              </div>
              <div>
                <dt className="text-[12.5px] text-ink-3">Matches</dt>
                <dd className="display num text-[1.9rem]">{s.n_matches}</dd>
              </div>
              <div>
                <dt className="text-[12.5px] text-ink-3">Pressure moments</dt>
                <dd className="display num text-[1.9rem] text-pink">{(s.contrast.pressure.balls / 1000).toFixed(0)}k</dd>
              </div>
            </dl>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px] text-ink-2">
              <span>
                <b className="text-ink">{first.team}</b> {first.runs}/{first.wkts}
                <span className="mx-2 text-ink-3">then</span>
                <b className="text-ink">{second.team}</b> {second.runs}/{second.wkts}
              </span>
              <Badge tone="pink">{hero.result}</Badge>
            </div>
            <WinWorm worm={hero.worm} animate height={320} labels={{ first: `${first.team} batting`, second: `${second.team} batting` }} />
          </div>
        </div>
      </section>

      <SectionHead title="The answer: top 10 under pressure">
        Ranked by how much each player added in high-pressure moments, how much better that is than their own normal
        level, and how consistently they did it. The meter shows how often a player stays in the top 10 when we re-run the
        ranking 400 times on reshuffled matches.
      </SectionHead>
      <div className="grid gap-5 xl:grid-cols-2">
        <TopTen title="Batters" role="bat" players={bat.slice(0, 10)} />
        <TopTen title="Bowlers" role="bowl" players={bowl.slice(0, 10)} />
      </div>

      <SectionHead title="What it means for Rajasthan Royals">
        The same method applied to RR’s own 2026 season shows where matches were won and lost.
      </SectionHead>
      <div className="grid gap-5 lg:grid-cols-3">
        <Link href="/rajasthan/" className="panel group flex flex-col gap-2 p-5 hover:border-line-strong">
          <span className="text-[13px] text-ink-3">IPL 2026</span>
          <span className="display text-[2.6rem]">
            {ordinal(rr.summary.pos)} place, {rr.summary.won}–{rr.summary.lost}
          </span>
          <span className="text-[14px] leading-relaxed text-ink-2">
            {rr.summary.playoff_result ?? 'Playoffs'}. Open the full season review.
          </span>
        </Link>
        <div className="panel flex flex-col gap-2 p-5">
          <span className="text-[13px] text-ink-3">Biggest strength</span>
          <span className="display num text-[2.6rem] text-pink">{signed(best.gap_vs_avg)} runs</span>
          <span className="text-[14px] leading-relaxed text-ink-2">
            per match from {phaseName(best)}, ranked {ordinal(best.rank)} of 10 teams.
          </span>
        </div>
        <Link href="/auction/" className="panel group flex flex-col gap-2 border-gold/40 p-5 hover:border-gold">
          <span className="text-[13px] text-ink-3">Biggest leak</span>
          <span className="display num text-[2.6rem] text-blue">{signed(worst.gap_vs_avg)} runs</span>
          <span className="text-[14px] leading-relaxed text-ink-2">
            per match in {phaseName(worst)}. See the players who fix it.
          </span>
        </Link>
      </div>
    </div>
  )
}

function ordinal(n: number) {
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10 > 3 || Math.floor(n / 10) === 1 ? 0 : n % 10]}`
}

function TopTen({ title, role, players }: { title: string; role: Role; players: Player[] }) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h3 className="display text-[1.7rem]">{title}</h3>
        <Link href={`/rankings/${role}/`} className="text-[13.5px] font-semibold text-pink-ink hover:underline">
          Full rankings
        </Link>
      </div>
      <div className="grid grid-cols-[2.2rem_minmax(0,1fr)_5.5rem_5.5rem] gap-x-3 px-5 pb-1 pt-3 text-[12px] text-ink-3">
        <span />
        <span>Player</span>
        <span className="text-right">{role === 'bat' ? 'Strike rate' : 'Economy'}</span>
        <span className="text-right">Stays top 10</span>
      </div>
      <ol>
        {players.map((p) => (
          <li key={p.id}>
            <Link
              href={`/players/${role}/${p.id}/`}
              className="grid min-h-14 grid-cols-[2.2rem_minmax(0,1fr)_5.5rem_5.5rem] items-center gap-x-3 border-t border-line px-5 py-2 hover:bg-panel-2"
            >
              <span className={`display num text-[1.7rem] ${p.rank <= 3 ? 'text-pink' : 'text-ink-3'}`}>{p.rank}</span>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold">{p.name}</span>
                <span className="block truncate text-[12.5px] text-ink-3">
                  {[p.country, iplCode(p.ipl_team)].filter(Boolean).join(', ')}
                </span>
              </span>
              <span className="num text-right text-[14px]">
                <b>{role === 'bat' ? fmt.dec(p.press.sr, 0) : fmt.dec(p.press.econ, 2)}</b>
                <span className="block text-[11.5px] text-ink-3">
                  normally {role === 'bat' ? fmt.dec(p.norm.sr, 0) : fmt.dec(p.norm.econ, 2)}
                </span>
              </span>
              <span className="flex items-center justify-end gap-2">
                <span className="h-1.5 w-10 overflow-hidden rounded-full bg-panel-2">
                  <span className="block h-full rounded-full bg-blue" style={{ width: `${p.boot.p_top10 * 100}%` }} />
                </span>
                <span className="num w-9 text-right text-[13.5px] font-medium">{fmt.pct(p.boot.p_top10)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
