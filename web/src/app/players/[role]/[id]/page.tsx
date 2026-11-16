import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge, Stat, StatRow, signed } from '@/components/ui'
import { getRole } from '@/lib/data'
import { fmt } from '@/lib/format'
import type { Player, Role } from '@/lib/types'
import { ProfileCharts } from '@/views/Profile'

type Params = { role: Role; id: string }

export function generateStaticParams() {
  return (['bat', 'bowl'] as const).flatMap((role) => getRole(role).players.map((p) => ({ role, id: String(p.id) })))
}

function find(role: Role, id: string) {
  const list = getRole(role).players
  const i = list.findIndex((p) => String(p.id) === id)
  return { p: list[i], prev: list[i - 1], next: list[i + 1], total: list.length }
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { role, id } = await params
  const { p } = find(role, id)
  return { title: p ? `${p.name}, ${role === 'bat' ? 'batting' : 'bowling'} under pressure` : 'Player' }
}

/** One plain-English sentence summarising the player, generated from the numbers. */
function story(p: Player, role: Role) {
  const last = p.name.split(' ').slice(-1)[0]
  if (role === 'bat') {
    const up = (p.press.sr ?? 0) >= (p.norm.sr ?? 0)
    return `Under pressure ${last} strikes at ${fmt.dec(p.press.sr, 0)}, ${up ? 'up from' : 'down from'} ${fmt.dec(p.norm.sr, 0)} in ordinary moments, and averages ${fmt.dec(p.press.avg, 1)} runs per dismissal. Allowing for how hard those situations were, that is ${signed(p.p_rv100)} runs per 100 balls against an average batter.`
  }
  const up = (p.press.econ ?? 99) <= (p.norm.econ ?? 99)
  return `Under pressure ${last} concedes ${fmt.dec(p.press.econ, 2)} an over (${up ? 'tighter than' : 'looser than'} ${fmt.dec(p.norm.econ, 2)} normally) and takes a wicket every ${fmt.dec(p.press.sr, 0)} balls. Allowing for the situations, that saves ${signed(p.p_rv100)} runs per 100 balls against an average bowler.`
}

export default async function PlayerPage({ params }: { params: Promise<Params> }) {
  const { role, id } = await params
  const { p, prev, next, total } = find(role, id)
  if (!p) notFound()
  const isBat = role === 'bat'
  const rows: [string, string, string, boolean | null][] = isBat
    ? [
        ['Strike rate', fmt.dec(p.press.sr), fmt.dec(p.norm.sr), cmp(p.press.sr, p.norm.sr, 1)],
        ['Runs per dismissal', fmt.dec(p.press.avg), fmt.dec(p.norm.avg), cmp(p.press.avg, p.norm.avg, 1)],
        ['Dot balls', `${fmt.dec(p.press.dot_pct)}%`, `${fmt.dec(p.norm.dot_pct)}%`, cmp(p.press.dot_pct, p.norm.dot_pct, -1)],
        ['Boundary balls', `${fmt.dec(p.press.bnd_pct)}%`, `${fmt.dec(p.norm.bnd_pct)}%`, cmp(p.press.bnd_pct, p.norm.bnd_pct, 1)],
        ['Balls, runs, outs', `${p.press.balls}, ${p.press.runs}, ${p.press.outs}`, `${p.norm.balls}, ${p.norm.runs}, ${p.norm.outs}`, null],
      ]
    : [
        ['Economy', fmt.dec(p.press.econ, 2), fmt.dec(p.norm.econ, 2), cmp(p.press.econ, p.norm.econ, -1)],
        ['Balls per wicket', fmt.dec(p.press.sr), fmt.dec(p.norm.sr), cmp(p.press.sr, p.norm.sr, -1)],
        ['Dot balls', `${fmt.dec(p.press.dot_pct)}%`, `${fmt.dec(p.norm.dot_pct)}%`, cmp(p.press.dot_pct, p.norm.dot_pct, 1)],
        ['Boundaries conceded', `${fmt.dec(p.press.bnd_pct)}%`, `${fmt.dec(p.norm.bnd_pct)}%`, cmp(p.press.bnd_pct, p.norm.bnd_pct, -1)],
        ['Balls, runs, wickets', `${p.press.balls}, ${p.press.runs}, ${p.press.outs}`, `${p.norm.balls}, ${p.norm.runs}, ${p.norm.outs}`, null],
      ]

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex flex-wrap items-center justify-between gap-2 text-[13.5px]" aria-label="Player navigation">
        <Link href={`/rankings/${role}/`} className="font-semibold text-pink-ink hover:underline">
          All {isBat ? 'batters' : 'bowlers'}
        </Link>
        <span className="flex gap-4">
          {prev && (
            <Link href={`/players/${role}/${prev.id}/`} className="text-ink-2 hover:text-ink">
              Previous: {prev.name}
            </Link>
          )}
          {next && (
            <Link href={`/players/${role}/${next.id}/`} className="text-ink-2 hover:text-ink">
              Next: {next.name}
            </Link>
          )}
        </span>
      </nav>

      <header className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-end">
        <div className="flex flex-col gap-3">
          <div className="flex items-end gap-4">
            <span className="display num text-[4.6rem] leading-[0.8] text-pink">{p.rank}</span>
            <div>
              <h1 className="display text-[2.8rem] sm:text-[3.3rem]">{p.name}</h1>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {p.country && <Badge>{p.country}</Badge>}
                {p.ipl_team && <Badge tone="blue">{p.ipl_team}, IPL {p.ipl_season}</Badge>}
                <Badge>{isBat ? p.hand : p.bowl_type}</Badge>
                {p.ipl_team === 'Rajasthan Royals' && <Badge tone="pink">RR player</Badge>}
              </div>
            </div>
          </div>
          <p className="max-w-[68ch] text-[15.5px] leading-relaxed text-ink-2">{story(p, role)}</p>
        </div>
        <StatRow cols={2}>
          <Stat label={`Rank of ${total}`} value={`#${p.rank}`} tone="pink" note={`Stays top 10 in ${fmt.pct(p.boot.p_top10)} of 400 re-runs`} />
          <Stat label="Likely rank range" value={`${p.boot.rank_lo}–${p.boot.rank_hi}`} note="9 times in 10 the rank lands here" />
          <Stat label="Pressure balls" value={fmt.int(p.p_balls)} note={`across ${p.p_matches} matches`} />
          <Stat label="Runs added per 100, under pressure" value={signed(p.p_rv100)} note={`${signed(p.n_rv100)} in ordinary moments`} tone={p.p_rv100 >= 0 ? 'pink' : 'blue'} />
        </StatRow>
      </header>

      <section className="panel overflow-hidden">
        <div className="border-b border-line px-5 py-3.5">
          <h2 className="display text-[1.5rem]">Pressure moments against ordinary moments</h2>
          <p className="text-[13px] text-ink-3">Raw numbers, no adjustment. Pink marks the better column.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[14px]">
            <thead className="text-[12.5px] text-ink-3">
              <tr className="border-b border-line">
                <th className="px-5 py-2 text-left font-medium" />
                <th className="px-3 py-2 text-right font-medium">Under pressure</th>
                <th className="px-5 py-2 text-right font-medium">Ordinary</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, a, b, better]) => (
                <tr key={label} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5 text-ink-2">{label}</td>
                  <td className={`num px-3 py-2.5 text-right font-semibold ${better === true ? 'text-pink-ink' : ''}`}>{a}</td>
                  <td className={`num px-5 py-2.5 text-right ${better === false ? 'font-semibold text-pink-ink' : 'text-ink-2'}`}>{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-3 gap-px border-t border-line bg-line">
          {p.phases.map((ph) => (
            <div key={ph.phase} className="bg-panel px-5 py-3">
              <div className="text-[12.5px] text-ink-3">{ph.phase === 'Middle' ? 'Middle overs' : ph.phase} pressure</div>
              <div className="num text-[16px] font-semibold">{signed(ph.rv100)}</div>
              <div className="num text-[12px] text-ink-3">{ph.balls} balls</div>
            </div>
          ))}
        </div>
      </section>

      <ProfileCharts p={p} role={role} />
    </div>
  )
}

function cmp(a: number | null | undefined, b: number | null | undefined, dir: 1 | -1): boolean | null {
  if (a == null || b == null || a === b) return null
  return (a - b) * dir > 0
}
