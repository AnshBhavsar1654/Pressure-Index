import { MagnifyingGlass } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { ChartFrame, Legend } from '../components/charts/core'
import { PressureScatter } from '../components/charts/Scatter'
import { COMPONENT_HINT, COMPONENT_LABEL, type ComponentKey, type RoleData, type Role, type ScoredPlayer, type Weights } from '../lib/data'
import { fmt, iplCode } from '../lib/format'

interface Props {
  role: Role
  roleData: RoleData
  players: ScoredPlayer[]
  weights: Weights
  defaults: Weights
  setWeights: (w: Weights) => void
  openPlayer: (role: Role, id: number) => void
}

type SortKey = 'liveRank' | 'p_rv100' | 'n_rv100' | 'delta100' | 'wpa100' | 'cons' | 'p_balls' | 'p_top10' | 'trad'

export function Leaderboard({ role, roleData, players, weights, defaults, setWeights, openPlayer }: Props) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'liveRank', dir: 1 })
  const top10 = useMemo(() => new Set(players.slice(0, 10).map((p) => p.id)), [players])
  const noun = role === 'bat' ? 'batters' : 'bowlers'

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    const f = players.filter(
      (p) =>
        !term ||
        p.name.toLowerCase().includes(term) ||
        (p.country ?? '').toLowerCase().includes(term) ||
        (p.ipl_team ?? '').toLowerCase().includes(term),
    )
    const val = (p: ScoredPlayer): number => {
      switch (sort.key) {
        case 'p_top10':
          return p.boot.p_top10
        case 'trad':
          return (role === 'bat' ? p.press.sr : p.press.econ) ?? 0
        default:
          return p[sort.key] as number
      }
    }
    return [...f].sort((a, b) => (val(a) - val(b)) * sort.dir)
  }, [players, q, sort, role])

  const changed = (Object.keys(weights) as ComponentKey[]).some((k) => Math.abs(weights[k] - defaults[k]) > 1e-9)

  const head = (key: SortKey, label: string, title?: string, align: 'left' | 'right' = 'right') => (
    <th className={`px-3 py-2 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`} title={title}>
      <button
        className={`uppercase tracking-wider hover:text-ink ${sort.key === key ? 'text-ink' : ''}`}
        onClick={() =>
          setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === 'liveRank' ? 1 : -1 }))
        }
      >
        {label}
        {sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  )

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="eyebrow">Step 3 · Rankings</p>
        <h1 className="display text-[2.3rem] font-bold leading-none">
          {role === 'bat' ? 'Batters' : 'Bowlers'} under pressure
        </h1>
        <p className="max-w-[72ch] text-[14px] leading-relaxed text-ink-2">
          {roleData.eligibility.n_eligible} {noun} qualify with at least {roleData.eligibility.min_pressure_balls}{' '}
          high-pressure balls across {roleData.eligibility.min_pressure_matches}+ matches. The rating blends four
          standardised components. Move the weights to test how sensitive the order is: the default blend is the submitted
          ranking.
        </p>
      </header>

      <section className="panel grid gap-5 p-5 lg:grid-cols-[1fr_auto]">
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {(Object.keys(COMPONENT_LABEL) as ComponentKey[]).map((k) => (
            <div key={k} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={`w-${k}`} className="text-[13.5px] font-semibold text-ink">
                  {COMPONENT_LABEL[k]}
                </label>
                <span className="num text-[13px] font-medium text-pink">{Math.round(weights[k] * 100)}%</span>
              </div>
              <input
                id={`w-${k}`}
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={weights[k]}
                onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) })}
              />
              <span className="text-[12px] leading-snug text-ink-3">{COMPONENT_HINT[k]}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col justify-between gap-3 lg:w-48 lg:border-l lg:border-line lg:pl-5">
          <p className="text-[12.5px] leading-relaxed text-ink-2">
            Weights are normalised to sum to 100%. Ranks and the top-10 highlight update live.
          </p>
          <button
            disabled={!changed}
            onClick={() => setWeights(defaults)}
            className="rounded-[3px] border border-line-strong px-3 py-2 text-[13px] font-semibold text-ink enabled:hover:border-pink enabled:hover:text-pink disabled:opacity-40"
          >
            Reset to submitted weights
          </button>
        </div>
      </section>

      <ChartFrame
        title="Pressure level against baseline level"
        subtitle={`Each dot is one eligible ${role === 'bat' ? 'batter' : 'bowler'}, sized by pressure balls. Above the line means better under pressure than in ordinary situations. Pink marks the current top 10. Click a dot to open the profile.`}
        legend={
          <Legend
            items={[
              { label: 'Current top 10', color: 'var(--pink)' },
              { label: `Other eligible ${noun}`, color: 'var(--neutral-mark)' },
            ]}
          />
        }
        footnote="Run value: runs added above what an average player would produce from the same match state (balls left, wickets down, competition, season), with each wicket priced at the runs it costs from that state. Values are per 100 balls."
      >
        <PressureScatter players={players} highlight={top10} onSelect={(id) => openPlayer(role, id)} />
      </ChartFrame>

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h3 className="display text-[1.3rem] font-semibold">Full leaderboard</h3>
          <label className="flex items-center gap-2 rounded-[3px] border border-line-strong bg-paper px-2.5 py-1.5 text-[13px]">
            <MagnifyingGlass size={15} weight="bold" className="text-ink-3" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Player, country or IPL team"
              className="w-56 bg-transparent outline-none placeholder:text-ink-3"
              aria-label={`Search ${noun}`}
            />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-[13px]">
            <thead className="text-[11px] text-ink-3">
              <tr className="border-b border-line">
                {head('liveRank', '#', undefined, 'left')}
                <th className="px-3 py-2 text-left font-medium uppercase tracking-wider">Player</th>
                {head('p_balls', 'P balls', 'High-pressure balls faced or bowled')}
                {head('trad', role === 'bat' ? 'P SR' : 'P econ', 'Traditional rate under pressure (vs baseline)')}
                {head('p_rv100', 'P RV/100', 'Pressure run value per 100 balls (shrunk)')}
                {head('n_rv100', 'Base RV/100', 'Baseline run value per 100 ordinary balls (shrunk)')}
                {head('delta100', 'Lift', 'Pressure minus baseline (shrunk)')}
                {head('wpa100', 'WPA/100', 'Win probability added per 100 pressure balls')}
                {head('cons', 'Consistency', 'Share of pressure innings/spells above expectation')}
                {head('p_top10', 'Holds top 10', 'Bootstrap probability of a top-10 finish')}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => openPlayer(role, p.id)}
                  className={`cursor-pointer border-b border-line last:border-0 hover:bg-surface-2 ${top10.has(p.id) ? '' : ''}`}
                >
                  <td className="px-3 py-2">
                    <span className={`display num text-[1.1rem] font-bold ${top10.has(p.id) ? 'text-pink' : 'text-ink-3'}`}>
                      {p.liveRank}
                    </span>
                    {p.liveRank !== p.rank && (
                      <span className="num ml-1 text-[11px] text-ink-3" title="Submitted rank">
                        ({p.rank})
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-ink">{p.name}</div>
                    <div className="text-[11.5px] text-ink-3">
                      {[p.country, iplCode(p.ipl_team), role === 'bowl' ? p.bowl_type : p.hand].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td className="num px-3 py-2 text-right">{fmt.int(p.p_balls)}</td>
                  <td className="num px-3 py-2 text-right">
                    {role === 'bat' ? fmt.dec(p.press.sr, 0) : fmt.dec(p.press.econ, 2)}
                    <span className="ml-1 text-[11px] text-ink-3">
                      / {role === 'bat' ? fmt.dec(p.norm.sr, 0) : fmt.dec(p.norm.econ, 2)}
                    </span>
                  </td>
                  <td className="num px-3 py-2 text-right font-semibold">{fmt.signed(p.p_rv100)}</td>
                  <td className="num px-3 py-2 text-right text-ink-2">{fmt.signed(p.n_rv100)}</td>
                  <td className={`num px-3 py-2 text-right ${p.delta100 >= 0 ? 'text-pink' : 'text-blue'}`}>{fmt.signed(p.delta100)}</td>
                  <td className="num px-3 py-2 text-right">{fmt.signed(p.wpa100, 2)}</td>
                  <td className="num px-3 py-2 text-right">{fmt.pct(p.cons)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <span className="h-[5px] w-14 rounded-full bg-surface-2">
                        <span className="block h-[5px] rounded-full bg-blue" style={{ width: `${p.boot.p_top10 * 100}%` }} />
                      </span>
                      <span className="num w-9 text-right">{fmt.pct(p.boot.p_top10)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
