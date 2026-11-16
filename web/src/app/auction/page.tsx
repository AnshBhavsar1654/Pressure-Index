import { Crown, Info } from '@phosphor-icons/react/dist/ssr'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Badge, PageHead, Plain, signed } from '@/components/ui'
import { getRR } from '@/lib/data'
import { iplCode } from '@/lib/format'
import type { Candidate, Recommendation } from '@/lib/types'

export const metadata: Metadata = { title: 'IPL 2027 auction targets' }

export default function AuctionPage() {
  const rr = getRR()
  const recs = rr.recommendations
  const behind = recs.reduce((a, r) => a + r.gap.gap_vs_top4, 0)
  return (
    <>
      <PageHead
        title="IPL 2027 auction targets"
        takeaway={
          <>
            To go from fourth to champions, RR need to match the top four. In three areas they trailed them by a combined{' '}
            <b className="text-ink">{Math.abs(behind).toFixed(1)} runs a match</b>. For each one we list the players outside the
            RR squad who have done that exact job best since 2024, and who also stand up under pressure.
          </>
        }
      >
        <div className="max-w-sm">
          <Plain title="How a player is scored">
            <b>70%</b>: runs they added in that phase per 100 balls (IPL and full T20Is, 2024 to 2026, recent seasons count
            more). <b>30%</b>: their pressure rating. Small samples are pulled towards average so one hot month cannot top
            the list.
          </Plain>
        </div>
      </PageHead>

      <div
        className={`mb-8 flex gap-3 rounded-[10px] border px-4 py-3.5 text-[14px] leading-relaxed ${
          rr.pool.known ? 'border-line bg-panel' : 'border-gold/50 bg-gold-soft/50'
        }`}
        role="note"
      >
        <Info size={20} weight="fill" className="mt-0.5 shrink-0 text-gold" />
        <div className="text-ink-2">
          {rr.pool.known ? (
            <>Showing only players confirmed in the auction pool (updated {rr.pool.updated}).</>
          ) : (
            <>
              <b className="text-ink">Retention lists are due on 17 November 2026</b>, so the auction pool is not final yet.
              Each list ranks every eligible player outside the RR squad. Some, such as franchise captains, will be retained by
              their teams. Once the official released list is published, adding it to the data narrows each list to players
              RR can actually buy.
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-10">
        {recs.map((r, i) => (
          <RoleBlock key={r.gap.key} r={r} n={i + 1} />
        ))}
      </div>
    </>
  )
}

function RoleBlock({ r, n }: { r: Recommendation; n: number }) {
  const g = r.gap
  const isBat = g.discipline === 'bat'
  const maxFit = Math.max(...r.candidates.map((c) => c.fit))
  return (
    <section aria-labelledby={`role-${g.key}`} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="panel overflow-hidden">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-5 py-4">
          <div className="flex items-end gap-3">
            <span className="display num text-[3.2rem] leading-[0.8] text-ink-3">{n}</span>
            <div>
              <h2 id={`role-${g.key}`} className="display text-[2.1rem]">
                {r.role}
              </h2>
              <p className="text-[13.5px] text-ink-2">{r.role_desc}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="display num text-[2rem] text-blue">{signed(g.gap_vs_top4)} runs</div>
            <div className="text-[12.5px] text-ink-3">
              a match behind the top four in 2026. RR {signed(g.gap_vs_avg)} against an average side, {g.rank}th of 10
            </div>
          </div>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13.5px]">
            <thead className="text-[12.5px] text-ink-3">
              <tr className="border-b border-line">
                <th className="px-5 py-2.5 text-left font-medium">Player</th>
                <th className="px-2 py-2.5 text-left font-medium">2026 team</th>
                <th className="px-2 py-2.5 text-right font-medium" title={`Runs added per 100 balls in the ${g.phase.toLowerCase()}`}>
                  In this role
                </th>
                <th className="px-2 py-2.5 text-right font-medium">{isBat ? 'Strike rate' : 'Economy'}</th>
                <th className="px-2 py-2.5 text-right font-medium">Balls</th>
                <th className="px-2 py-2.5 text-right font-medium">Pressure rank</th>
                <th className="py-2.5 pl-2 pr-5 text-left font-medium">Fit score</th>
              </tr>
            </thead>
            <tbody>
              {r.candidates.map((c, i) => (
                <CandidateRow key={c.id} c={c} i={i} isBat={isBat} maxFit={maxFit} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <aside className="flex flex-col gap-4">
        <div className="panel p-4">
          <h3 className="mb-1 text-[14.5px] font-semibold">Already in the RR squad</h3>
          <p className="mb-3 text-[12.5px] text-ink-3">Same measure, same phase. Positive means above average.</p>
          <ul className="flex flex-col gap-2">
            {r.internal.length === 0 && <li className="text-[13px] text-ink-3">No squad player has enough balls in this role.</li>}
            {r.internal.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-2 text-[13.5px]">
                <span>{c.name}</span>
                <span className={`num font-semibold ${c.rv100 >= 0 ? 'text-pink-ink' : 'text-blue'}`}>{signed(c.rv100)}</span>
              </li>
            ))}
          </ul>
        </div>
        <Plain title="Why this role">
          RR were {g.rank}th of 10 here and {Math.abs(g.gap_vs_top4).toFixed(1)} runs a match behind the top four. Over 14 league
          games that is roughly {Math.abs(g.gap_vs_top4 * 14).toFixed(0)} runs: often the margin between fourth and a home
          qualifier.
        </Plain>
      </aside>
    </section>
  )
}

function CandidateRow({ c, i, isBat, maxFit }: { c: Candidate; i: number; isBat: boolean; maxFit: number }) {
  const href = c.press_rank != null ? `/players/${isBat ? 'bat' : 'bowl'}/${c.id}/` : null
  return (
    <tr className="border-b border-line last:border-0">
      <td className="px-5 py-2.5">
        <div className="flex items-center gap-2">
          {i < 3 ? <Crown size={17} weight="fill" className="shrink-0 text-gold" aria-label="top pick" /> : <span className="w-[17px]" />}
          {href ? (
            <Link href={href} className="font-semibold hover:underline">
              {c.name}
            </Link>
          ) : (
            <span className="font-semibold">{c.name}</span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-1 pl-[25px]">
          <Badge tone={c.overseas ? 'blue' : 'neutral'}>{c.overseas ? `Overseas, ${c.nat}` : c.nat}</Badge>
          {c.ipl_balls === 0 && <Badge>No IPL games since 2024</Badge>}
        </div>
      </td>
      <td className="px-2 py-2.5 text-ink-2">{c.ipl_team_2026 ? iplCode(c.ipl_team_2026) : '–'}</td>
      <td className={`num px-2 py-2.5 text-right font-semibold ${c.rv100 >= 0 ? 'text-pink-ink' : 'text-blue'}`}>{signed(c.rv100)}</td>
      <td className="num px-2 py-2.5 text-right">{isBat ? c.sr : c.econ}</td>
      <td className="num px-2 py-2.5 text-right text-ink-2">{c.balls}</td>
      <td className="num px-2 py-2.5 text-right text-ink-2">{c.press_rank ?? 'not ranked'}</td>
      <td className="py-2.5 pl-2 pr-5">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-14 overflow-hidden rounded-full bg-panel-2">
            <span className={`block h-full rounded-full ${i < 3 ? 'bg-gold' : 'bg-blue'}`} style={{ width: `${Math.max(8, (c.fit / maxFit) * 100)}%` }} />
          </span>
          <span className="num text-[12.5px] text-ink-3">{c.fit.toFixed(2)}</span>
        </div>
      </td>
    </tr>
  )
}
