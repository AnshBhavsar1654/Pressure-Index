import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHead, SectionHead, Stat, signed } from '@/components/kit'
import { Flag } from '@/components/Flag'
import { Term } from '@/components/Term'
import { getLab, getPlayer, getRanked, getRole, getSummary } from '@/lib/data'
import { fmt } from '@/lib/format'
import type { Player, Role } from '@/lib/types'

export const metadata: Metadata = { title: 'Insights' }

function List({ title, note, players, role, value }: { title: string; note: string; players: Player[]; role: Role; value: (p: Player) => string }) {
  return (
    <div className="panel p-5">
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <p className="mb-2 text-[12.5px] text-ink-3">{note}</p>
      <ol className="flex flex-col">
        {players.map((p, i) => (
          <li key={p.id} className="flex items-center justify-between gap-3 border-b border-line py-1.5 text-[13.5px] last:border-0">
            <span className="flex min-w-0 items-center gap-2">
              <span className="num w-5 text-ink-3">{i + 1}</span>
              <Flag country={p.country} size={16} />
              <Link href={`/players/${role}/${p.id}/`} className="truncate hover:underline">
                {p.name}
              </Link>
            </span>
            <span className="num shrink-0 font-semibold">{value(p)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export default function InsightsPage() {
  const s = getSummary()
  const lab = getLab()
  const c = s.contrast
  const q = { bat: getRanked('bat'), bowl: getRanked('bowl') }
  const by = (xs: Player[], f: (p: Player) => number, n = 8) => xs.toSorted((a, b) => f(b) - f(a)).slice(0, n)

  return (
    <>
      <PageHead
        title="Insights"
        summary="What the models say beyond the rankings: how the game changes when it is on the line, who rises and who drops, the new names, and the playing styles found by clustering."
      />

      <SectionHead title="What changes under pressure" id="league">
        The pressure label is built from the scoreboard alone, never from how players did, yet the cricket changes exactly as you would expect.
      </SectionHead>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Runs per over" value={c.pressure.rpo.toFixed(2)} tone="signal" note={`against ${c.normal.rpo.toFixed(2)} on other balls`} />
        <Stat label="Wickets per 100 balls" value={c.pressure.wkt_pct.toFixed(1)} tone="signal" note={`against ${c.normal.wkt_pct.toFixed(1)}`} />
        <Stat label="Boundary balls" value={`${c.pressure.bnd_pct.toFixed(1)}%`} note={`against ${c.normal.bnd_pct.toFixed(1)}%`} />
        <Stat label="Wides and no-balls" value={`${c.pressure.extras_pct.toFixed(1)}%`} note={`against ${c.normal.extras_pct.toFixed(1)}%: bowlers feel it too`} />
      </div>

      <SectionHead title="Who rises, who drops" id="lift">
        <Term k="lift">Lift</Term> = pressure rating minus usual level, among qualified players. It barely repeats between halves of the data (split-half r{' '}
        {lab.split_half.bat.lift.toFixed(2)} batting, {lab.split_half.bowl.lift.toFixed(2)} bowling), so read these as tendencies, not traits.
      </SectionHead>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <List title="Batters who rise" note="Largest lift" players={by(q.bat, (p) => p.delta100)} role="bat" value={(p) => signed(p.delta100)} />
        <List title="Batters who drop" note="Most negative lift" players={by(q.bat, (p) => -p.delta100)} role="bat" value={(p) => signed(p.delta100)} />
        <List title="Bowlers who rise" note="Largest lift" players={by(q.bowl, (p) => p.delta100)} role="bowl" value={(p) => signed(p.delta100)} />
        <List title="Bowlers who drop" note="Most negative lift" players={by(q.bowl, (p) => -p.delta100)} role="bowl" value={(p) => signed(p.delta100)} />
      </div>

      <SectionHead title="New faces" id="new">
        Players whose first top-level match came in {getRole('bat').eligibility.new_from} or later and who already clear the evidence bar, by pressure rating.
      </SectionHead>
      <div className="grid gap-4 md:grid-cols-2">
        <List title="Batters" note="New since the window opened" players={q.bat.filter((p) => p.new_face).slice(0, 8)} role="bat" value={(p) => signed(p.p_rv100)} />
        <List title="Bowlers" note="New since the window opened" players={q.bowl.filter((p) => p.new_face).slice(0, 8)} role="bowl" value={(p) => signed(p.p_rv100)} />
      </div>

      <SectionHead title="Who plays like whom" id="similar">
        A nearest-neighbour recommender over standardised style and pressure profiles. Two examples; any player can be explored on the style map.
      </SectionHead>
      <div className="grid gap-4 md:grid-cols-2">
        {(['bat', 'bowl'] as const).map((role) => {
          const top = q[role][0]
          const full = top ? getPlayer(role, top.id) : null
          return (
            <div key={role} className="panel p-5">
              <span className="eyebrow">{role === 'bat' ? 'Top-rated batter' : 'Top-rated bowler'}</span>
              <h3 className="mt-1 text-[15px] font-semibold">Plays most like {top?.name}</h3>
              <ol className="mt-2 flex flex-col">
                {(full?.similar ?? []).slice(0, 5).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 border-b border-line py-1.5 text-[13.5px] last:border-0">
                    <span className="min-w-0">
                      <Link href={`/players/${role}/${s.id}/`} className="hover:underline">
                        {s.name}
                      </Link>
                      <span className="block truncate text-[12px] text-ink-3">{s.why.join(', ')}</span>
                    </span>
                    <span className="num shrink-0 font-semibold">{Math.round(s.sim * 100)}%</span>
                  </li>
                ))}
              </ol>
              <Link href={`/similar/?role=${role}${top ? `&id=${top.id}` : ''}`} className="mt-3 block text-[13.5px] font-semibold text-signal-ink hover:underline">
                Open the similar-players finder
              </Link>
            </div>
          )
        })}
      </div>

      <SectionHead title="The highest-stakes balls" id="moments">
        The single most consequential delivery of each match, top-level cricket only. Almost all are last-over finishes.
      </SectionHead>
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[760px] text-[13.5px]">
          <thead className="text-[12.5px] text-ink-3">
            <tr className="border-b border-line">
              <th className="px-4 py-2.5 text-left font-medium">Match</th>
              <th className="py-2.5 text-left font-medium">Situation</th>
              <th className="py-2.5 text-left font-medium">Batter v bowler</th>
              <th className="py-2.5 text-right font-medium">
                <Term k="stakes" />
              </th>
              <th className="px-4 py-2.5 text-right font-medium">Win chance</th>
            </tr>
          </thead>
          <tbody>
            {s.moments.slice(0, 10).map((m) => (
              <tr key={m.id} className="border-b border-line last:border-0 hover:bg-panel-2">
                <td className="px-4 py-2.5">
                  <Link href={`/matches/?id=${m.id}`} className="font-medium hover:underline">
                    {m.match}
                  </Link>
                  <span className="block text-[12px] text-ink-3">
                    {m.comp}, {fmt.date(m.date)}
                  </span>
                </td>
                <td className="py-2.5 text-ink-2">
                  {m.over}: {m.state}
                </td>
                <td className="py-2.5 text-ink-2">
                  {m.striker} v {m.bowler}
                </td>
                <td className="num py-2.5 text-right font-semibold">{m.li.toFixed(1)}×</td>
                <td className="num px-4 py-2.5 text-right">{fmt.chance(m.wp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
