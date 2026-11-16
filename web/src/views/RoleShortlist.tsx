import { InfoIcon } from '@phosphor-icons/react/dist/ssr'
import { Note, ordinal, signed } from '@/components/kit'
import type { Recommendation, RRData } from '@/lib/types'
import { CandidateTable } from '@/views/CandidateTable'

/** Whether the auction pool is known yet, and what the lists below assume until it is. */
export function PoolNotice({ pool }: { pool: RRData['pool'] }) {
  return (
    <div
      className={`flex gap-3 rounded-[10px] border px-4 py-3.5 text-[14px] leading-relaxed ${pool.known ? 'border-line bg-panel' : 'border-gold/50 bg-gold-soft/50'}`}
      role="note"
    >
      <InfoIcon size={20} weight="fill" className="mt-0.5 shrink-0 text-gold" />
      <div className="text-ink-2">
        {pool.known ? (
          <>Players retained by their teams have been removed{pool.updated ? ` (list of ${pool.updated})` : ''}, so every name below can be bought at the auction.</>
        ) : (
          <>
            <b className="text-ink">Retention lists are due on 17 November 2026</b>, so the auction pool is not final yet. Each list
            starts with players likely to reach the auction: it assumes each franchise keeps the six players who added the most runs
            for it in 2026. Change that number, or switch to Everyone. Pakistani players are left out because they cannot register
            for the auction.
          </>
        )}
      </div>
    </div>
  )
}

/** One role RR need to fill: how far behind they were, the best outside options, and who in the squad does it now. */
export function RoleBlock({ r, n, poolKnown }: { r: Recommendation; n: number; poolKnown: boolean }) {
  const g = r.gap
  const isBat = g.discipline === 'bat'
  const behind = g.gap_vs_top4 < 0
  return (
    <section aria-labelledby={`role-${g.key}`} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="panel overflow-hidden">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-5 py-4">
          <div className="flex items-end gap-3">
            <span className="display num text-[3.2rem] leading-[0.8] text-ink-3">{n}</span>
            <div>
              <h3 id={`role-${g.key}`} className="display text-[2.1rem]">
                {r.role}
              </h3>
              <p className="text-[13.5px] text-ink-2">{r.role_desc}</p>
            </div>
          </div>
          <div className="ml-auto text-right">
            <div className="display num text-[2rem] text-blue">{signed(behind ? g.gap_vs_top4 : g.gap_vs_avg)} runs</div>
            <div className="text-[12.5px] text-ink-3">
              {behind
                ? `a match behind the top four in 2026. RR ${signed(g.gap_vs_avg)} against an average side, ${ordinal(g.rank)} of 10`
                : `a match against an average side in 2026, ${ordinal(g.rank)} of 10. Level with the top four, but still a leak`}
            </div>
          </div>
        </header>
        <CandidateTable candidates={r.candidates} isBat={isBat} phase={g.phase} defaultMin={r.default_min_balls} poolKnown={poolKnown} />
      </div>

      <aside className="flex flex-col gap-4">
        <div className="panel p-4">
          <h4 className="mb-1 text-[14.5px] font-semibold">Already in the RR squad</h4>
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
          {behind
            ? `RR were ${ordinal(g.rank)} of 10 here and ${Math.abs(g.gap_vs_top4).toFixed(1)} runs a match behind the top four. Over 14 league games that is roughly ${Math.abs(g.gap_vs_top4 * 14).toFixed(0)} runs: often the margin between fourth and a home qualifier.`
            : `RR matched the top four here but still gave away ${Math.abs(g.gap_vs_avg).toFixed(1)} runs a match to an average side, about ${Math.abs(g.gap_vs_avg * 14).toFixed(0)} runs over 14 league games.`}
        </Note>
      </aside>
    </section>
  )
}
