import { InfoIcon } from '@phosphor-icons/react/dist/ssr'
import type { Metadata } from 'next'
import { PageHead, Note, signed } from '@/components/kit'
import { getRR } from '@/lib/data'
import type { Recommendation } from '@/lib/types'
import { CandidateTable } from '@/views/CandidateTable'

export const metadata: Metadata = { title: 'IPL 2027 auction targets' }

export default function AuctionPage() {
  const rr = getRR()
  const recs = rr.recommendations
  const behind = recs.reduce((a, r) => a + r.gap.gap_vs_top4, 0)
  return (
    <>
      <PageHead
        title="IPL 2027 auction targets"
        summary={
          <>
            To go from fourth to champions, RR need to match the top four. In three areas they trailed them by a combined{' '}
            <b className="text-ink">{Math.abs(behind).toFixed(1)} runs a match</b>. For each one we list the players outside the
            RR squad who have done that exact job best since 2024, and who also stand up under pressure.
          </>
        }
      >
        <div className="max-w-sm">
          <Note title="How a player is scored">
            <b>70%</b>: runs they added in that phase per 100 balls (IPL and full T20Is, 2024 to 2026, recent seasons count
            more). <b>30%</b>: their pressure rating. Small samples are pulled towards average so one hot month cannot top
            the list.
          </Note>
        </div>
      </PageHead>

      <div
        className={`mb-8 flex gap-3 rounded-[10px] border px-4 py-3.5 text-[14px] leading-relaxed ${
          rr.pool.known ? 'border-line bg-panel' : 'border-gold/50 bg-gold-soft/50'
        }`}
        role="note"
      >
        <InfoIcon size={20} weight="fill" className="mt-0.5 shrink-0 text-gold" />
        <div className="text-ink-2">
          {rr.pool.known ? (
            <>Showing only players confirmed in the auction pool (updated {rr.pool.updated}).</>
          ) : (
            <>
              <b className="text-ink">Retention lists are due on 17 November 2026</b>, so the auction pool is not final yet.
              Each list ranks players outside the RR squad; use the sliders to widen or narrow the pool. Some, such as franchise captains, will be retained by
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
          <div className="ml-auto text-right">
            <div className="display num text-[2rem] text-blue">{signed(g.gap_vs_top4)} runs</div>
            <div className="text-[12.5px] text-ink-3">
              a match behind the top four in 2026. RR {signed(g.gap_vs_avg)} against an average side, {g.rank}th of 10
            </div>
          </div>
        </header>
        <CandidateTable candidates={r.candidates} isBat={isBat} phase={g.phase} defaultMin={r.default_min_balls} />
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
        <Note title="Why this role">
          RR were {g.rank}th of 10 here and {Math.abs(g.gap_vs_top4).toFixed(1)} runs a match behind the top four. Over 14 league
          games that is roughly {Math.abs(g.gap_vs_top4 * 14).toFixed(0)} runs: often the margin between fourth and a home
          qualifier.
        </Note>
      </aside>
    </section>
  )
}
