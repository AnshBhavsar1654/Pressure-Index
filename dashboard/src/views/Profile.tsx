import { useMemo } from 'react'
import { ChartFrame, Legend } from '../components/charts/core'
import { LineChart } from '../components/charts/LineChart'
import { ComponentBars, MatchStrip } from '../components/charts/Profile'
import { COMPONENT_LABEL, type Role, type ScoredPlayer } from '../lib/data'
import { fmt } from '../lib/format'

interface Props {
  role: Role
  setRole: (r: Role) => void
  players: ScoredPlayer[]
  playerId: number | null
  setPlayerId: (id: number) => void
}

export function Profile({ role, setRole, players, playerId, setPlayerId }: Props) {
  const p = useMemo(() => players.find((x) => x.id === playerId) ?? players[0], [players, playerId])
  const sorted = useMemo(() => [...players].sort((a, b) => a.name.localeCompare(b.name)), [players])
  const isBat = role === 'bat'
  const seasonSeries = [
    {
      key: 'p',
      label: 'Under pressure',
      color: 'var(--pink)',
      points: p.seasons.filter((s) => s.p_balls >= 12).map((s) => ({ x: s.season, y: s.p_rv100, n: s.p_balls })),
    },
    {
      key: 'n',
      label: 'Ordinary balls',
      color: 'var(--blue)',
      points: p.seasons.map((s) => ({ x: s.season, y: s.n_rv100 })),
    },
  ]
  const positive = p.matches.filter((m) => m.balls >= 6 && m.rv > 0).length
  const counted = p.matches.filter((m) => m.balls >= 6).length

  const statRows: { label: string; p: string; n: string; better: boolean | null }[] = isBat
    ? [
        { label: 'Strike rate', p: fmt.dec(p.press.sr, 1), n: fmt.dec(p.norm.sr, 1), better: cmp(p.press.sr, p.norm.sr, 1) },
        { label: 'Average', p: fmt.dec(p.press.avg, 1), n: fmt.dec(p.norm.avg, 1), better: cmp(p.press.avg, p.norm.avg, 1) },
        { label: 'Dot-ball %', p: fmt.dec(p.press.dot_pct), n: fmt.dec(p.norm.dot_pct), better: cmp(p.press.dot_pct, p.norm.dot_pct, -1) },
        { label: 'Boundary %', p: fmt.dec(p.press.bnd_pct), n: fmt.dec(p.norm.bnd_pct), better: cmp(p.press.bnd_pct, p.norm.bnd_pct, 1) },
        { label: 'Run value / 100 (raw)', p: fmt.signed(p.press.rv100), n: fmt.signed(p.norm.rv100), better: cmp(p.press.rv100, p.norm.rv100, 1) },
        { label: 'Balls · runs · outs', p: `${p.press.balls} · ${p.press.runs} · ${p.press.outs}`, n: `${p.norm.balls} · ${p.norm.runs} · ${p.norm.outs}`, better: null },
      ]
    : [
        { label: 'Economy', p: fmt.dec(p.press.econ, 2), n: fmt.dec(p.norm.econ, 2), better: cmp(p.press.econ, p.norm.econ, -1) },
        { label: 'Balls per wicket', p: fmt.dec(p.press.sr, 1), n: fmt.dec(p.norm.sr, 1), better: cmp(p.press.sr, p.norm.sr, -1) },
        { label: 'Dot-ball %', p: fmt.dec(p.press.dot_pct), n: fmt.dec(p.norm.dot_pct), better: cmp(p.press.dot_pct, p.norm.dot_pct, 1) },
        { label: 'Boundary % conceded', p: fmt.dec(p.press.bnd_pct), n: fmt.dec(p.norm.bnd_pct), better: cmp(p.press.bnd_pct, p.norm.bnd_pct, -1) },
        { label: 'Run value / 100 (raw)', p: fmt.signed(p.press.rv100), n: fmt.signed(p.norm.rv100), better: cmp(p.press.rv100, p.norm.rv100, 1) },
        { label: 'Balls · runs · wickets', p: `${p.press.balls} · ${p.press.runs} · ${p.press.outs}`, n: `${p.norm.balls} · ${p.norm.runs} · ${p.norm.outs}`, better: null },
      ]

  return (
    <div className="flex flex-col gap-6">
      <section className="panel flex flex-wrap items-center gap-3 p-3">
        <div role="tablist" aria-label="Role" className="flex rounded-[3px] border border-line-strong p-0.5">
          {(['bat', 'bowl'] as Role[]).map((r) => (
            <button
              key={r}
              role="tab"
              aria-selected={role === r}
              onClick={() => setRole(r)}
              className={`rounded-[2px] px-3 py-1.5 text-[13px] font-semibold ${role === r ? 'bg-navy text-navy-ink' : 'text-ink-2 hover:text-ink'}`}
            >
              {r === 'bat' ? 'Batters' : 'Bowlers'}
            </button>
          ))}
        </div>
        <label className="flex min-w-0 flex-1 items-center gap-2 text-[13px]">
          <span className="text-ink-2">Player</span>
          <select
            value={p.id}
            onChange={(e) => setPlayerId(Number(e.target.value))}
            className="min-w-0 flex-1 rounded-[3px] border border-line-strong bg-paper px-2 py-1.5 text-ink sm:max-w-xs"
          >
            {sorted.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} (#{x.liveRank})
              </option>
            ))}
          </select>
        </label>
      </section>

      <header className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-2">
          <p className="eyebrow">{isBat ? 'Batter' : 'Bowler'} profile</p>
          <div className="flex items-baseline gap-4">
            <span className="display num text-[3.4rem] font-bold leading-none text-pink">#{p.liveRank}</span>
            <h1 className="display text-[2.6rem] font-bold leading-none">{p.name}</h1>
          </div>
          <p className="text-[14px] text-ink-2">
            {[p.country, p.ipl_team && `${p.ipl_team} (IPL ${p.ipl_season})`, isBat ? p.hand : p.bowl_type]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="max-w-[60ch] text-[13.5px] leading-relaxed text-ink-2">
            {fmt.int(p.p_balls)} high-pressure balls across {p.p_matches} matches. In {positive} of {counted} pressure
            {isBat ? ' innings' : ' spells'} (6+ balls) the output beat expectation. Across 400 bootstrap resamples of the
            matches, {p.name.split(' ').slice(-1)[0]} ranks between <b>{p.boot.rank_lo}</b> and <b>{p.boot.rank_hi}</b>{' '}
            (90% interval) and finishes top 10 in <b>{fmt.pct(p.boot.p_top10)}</b> of them.
          </p>
        </div>
        <div className="panel p-5">
          <p className="eyebrow mb-3">Rating components (z-score among eligible)</p>
          <ComponentBars z={p.z} labels={COMPONENT_LABEL} />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <section className="panel overflow-hidden">
          <div className="border-b border-line px-5 py-3.5">
            <h3 className="display text-[1.3rem] font-semibold">Pressure against ordinary balls</h3>
            <p className="text-[12.5px] text-ink-3">Unweighted raw numbers. Pink marks the better side for the player.</p>
          </div>
          <table className="w-full text-[13.5px]">
            <thead className="text-[11px] uppercase tracking-wider text-ink-3">
              <tr className="border-b border-line">
                <th className="px-5 py-2 text-left font-medium" />
                <th className="px-3 py-2 text-right font-medium">Pressure</th>
                <th className="px-5 py-2 text-right font-medium">Ordinary</th>
              </tr>
            </thead>
            <tbody>
              {statRows.map((r) => (
                <tr key={r.label} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5 text-ink-2">{r.label}</td>
                  <td className={`num px-3 py-2.5 text-right font-semibold ${r.better === true ? 'text-pink' : ''}`}>{r.p}</td>
                  <td className={`num px-5 py-2.5 text-right ${r.better === false ? 'font-semibold text-pink' : 'text-ink-2'}`}>{r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid grid-cols-3 gap-px border-t border-line bg-line">
            {p.phases.map((ph) => (
              <div key={ph.phase} className="bg-surface px-4 py-3">
                <div className="text-[11.5px] text-ink-3">{ph.phase} pressure</div>
                <div className="num text-[15px] font-semibold">{fmt.signed(ph.rv100)}</div>
                <div className="num text-[11px] text-ink-3">{ph.balls} balls</div>
              </div>
            ))}
          </div>
        </section>
        <ChartFrame
          title="Season by season"
          subtitle="Run value per 100 balls. Pressure seasons with fewer than 12 balls are hidden. Hover to see ball counts."
          legend={<Legend items={seasonSeries.map((s) => ({ label: s.label, color: s.color, shape: 'line' }))} />}
        >
          <LineChart series={seasonSeries} xTicks={p.seasons.map((s) => s.season)} zeroLine showPoints yFormat={(v) => fmt.signed(v, 0)} height={250} />
        </ChartFrame>
      </div>

      <ChartFrame
        title="Every match with pressure exposure"
        subtitle={`Run value in each match's high-pressure balls, oldest to newest. Pink is above expectation, blue below. A steady run of pink is what consistency looks like.`}
        legend={
          <Legend
            items={[
              { label: 'Above expectation', color: 'var(--pink)' },
              { label: 'Below expectation', color: 'var(--blue)' },
            ]}
          />
        }
      >
        <MatchStrip matches={p.matches} role={role} />
      </ChartFrame>
    </div>
  )
}

function cmp(a: number | null | undefined, b: number | null | undefined, dir: 1 | -1): boolean | null {
  if (a == null || b == null) return null
  if (a === b) return null
  return (a - b) * dir > 0
}
