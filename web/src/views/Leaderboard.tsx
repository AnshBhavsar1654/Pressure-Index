'use client'

import { ArrowCounterClockwise, MagnifyingGlass } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { ChartFrame, Legend } from '@/components/charts/core'
import { PressureScatter } from '@/components/charts/Scatter'
import { fmt, iplCode } from '@/lib/format'
import { COMPONENT_HINT, COMPONENT_LABEL, rescore, type ComponentKey, type Player, type Role, type ScoredPlayer, type Weights } from '@/lib/types'

type SortKey = 'liveRank' | 'p_rv100' | 'n_rv100' | 'delta100' | 'wpa100' | 'cons' | 'p_balls' | 'p_top10' | 'trad'

const SHORT: Record<ComponentKey, string> = {
  pressure: 'Output under pressure',
  impact: 'Match-winning impact',
  delta: 'Rise above own normal',
  consistency: 'Consistency',
}

export function Leaderboard({ role, players: raw, defaults }: { role: Role; players: Player[]; defaults: Weights }) {
  const router = useRouter()
  const [weights, setWeights] = useState<Weights>(defaults)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'liveRank', dir: 1 })
  const players = useMemo(() => rescore(raw, weights), [raw, weights])
  const top10 = useMemo(() => new Set(players.slice(0, 10).map((p) => p.id)), [players])
  const noun = role === 'bat' ? 'batters' : 'bowlers'
  const open = (id: number) => router.push(`/players/${role}/${id}/`)

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    const f = players.filter(
      (p) => !term || [p.name, p.country ?? '', p.ipl_team ?? ''].some((s) => s.toLowerCase().includes(term)),
    )
    const val = (p: ScoredPlayer): number =>
      sort.key === 'p_top10' ? p.boot.p_top10 : sort.key === 'trad' ? ((role === 'bat' ? p.press.sr : p.press.econ) ?? 0) : (p[sort.key] as number)
    return [...f].sort((a, b) => (val(a) - val(b)) * sort.dir)
  }, [players, q, sort, role])

  const changed = (Object.keys(weights) as ComponentKey[]).some((k) => Math.abs(weights[k] - defaults[k]) > 1e-9)
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1

  const head = (key: SortKey, label: string, title?: string, align: 'left' | 'right' = 'right') => (
    <th
      className={`px-3 py-2.5 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}
      title={title}
      aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
    >
      <button
        className={`hover:text-ink ${sort.key === key ? 'text-ink' : ''}`}
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === 'liveRank' ? 1 : -1 }))}
      >
        {label}
        {sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  )

  return (
    <div className="flex flex-col gap-6">
      <section className="panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="display text-[1.6rem]">Build your own ranking</h2>
            <p className="text-[13.5px] text-ink-2">
              Four ingredients make the rating. Drag a slider to change how much each one counts and watch the order move.
            </p>
          </div>
          <button
            disabled={!changed}
            onClick={() => setWeights(defaults)}
            className="flex min-h-10 items-center gap-2 rounded-lg border border-line-strong px-3 text-[13.5px] font-semibold enabled:hover:border-pink enabled:hover:text-pink-ink disabled:opacity-40"
          >
            <ArrowCounterClockwise size={16} weight="bold" /> Back to submitted ranking
          </button>
        </div>
        <div className="grid gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-4">
          {(Object.keys(COMPONENT_LABEL) as ComponentKey[]).map((k) => (
            <div key={k} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={`w-${k}`} className="text-[14px] font-semibold">
                  {SHORT[k]}
                </label>
                <span className="display num text-[1.4rem] text-pink">{Math.round((weights[k] / total) * 100)}%</span>
              </div>
              <input
                id={`w-${k}`}
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={weights[k]}
                onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) })}
                className="h-6"
              />
              <span className="text-[12.5px] leading-snug text-ink-3">{COMPONENT_HINT[k]}</span>
            </div>
          ))}
        </div>
      </section>

      <ChartFrame
        title="Normal level against pressure level"
        subtitle={`Every eligible ${role === 'bat' ? 'batter' : 'bowler'}. Further right means better in ordinary moments; higher means better in pressure moments. Above the diagonal means they get better when it matters. Dot size is how many pressure balls they have played. Pink marks the current top 10; click any dot to open the player.`}
        legend={
          <Legend
            items={[
              { label: 'Current top 10', color: 'var(--pink)' },
              { label: `Other ${noun}`, color: 'var(--neutral-mark)' },
            ]}
          />
        }
        footnote="Values are runs added per 100 balls compared with an average player in the exact same match situation."
      >
        <PressureScatter players={players} highlight={top10} onSelect={open} height={460} />
      </ChartFrame>

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="display text-[1.6rem]">
            All {players.length} eligible {noun}
          </h2>
          <label className="flex min-h-10 items-center gap-2 rounded-lg border border-line-strong bg-panel-2 px-3 text-[14px]">
            <MagnifyingGlass size={16} weight="bold" className="text-ink-3" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search player, country or team"
              className="w-60 bg-transparent outline-none placeholder:text-ink-3"
              aria-label={`Search ${noun}`}
            />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-[13.5px]">
            <thead className="text-[12.5px] text-ink-3">
              <tr className="border-b border-line">
                {head('liveRank', 'Rank', undefined, 'left')}
                <th className="px-3 py-2.5 text-left font-medium">Player</th>
                {head('p_balls', 'Pressure balls')}
                {head('trad', role === 'bat' ? 'Strike rate' : 'Economy', 'Under pressure, with their normal figure after the slash')}
                {head('p_rv100', 'Under pressure', 'Runs added per 100 pressure balls')}
                {head('n_rv100', 'Normally', 'Runs added per 100 ordinary balls')}
                {head('delta100', 'Rise', 'Pressure level minus normal level')}
                {head('wpa100', 'Impact', 'Win probability added per 100 pressure balls')}
                {head('cons', 'Consistency', 'Share of pressure innings or spells above expectation')}
                {head('p_top10', 'Stays top 10', 'Share of 400 reshuffled re-runs that keep the player in the top 10')}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} onClick={() => open(p.id)} className="cursor-pointer border-b border-line last:border-0 hover:bg-panel-2">
                  <td className="px-3 py-2.5">
                    <span className={`display num text-[1.35rem] ${top10.has(p.id) ? 'text-pink' : 'text-ink-3'}`}>{p.liveRank}</span>
                    {p.liveRank !== p.rank && (
                      <span className="num ml-1.5 text-[11.5px] text-ink-3" title="Submitted rank">
                        was {p.rank}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <a href={`/players/${role}/${p.id}/`} onClick={(e) => e.stopPropagation()} className="font-semibold hover:underline">
                      {p.name}
                    </a>
                    <div className="text-[12px] text-ink-3">
                      {[p.country, iplCode(p.ipl_team), role === 'bowl' ? p.bowl_type : p.hand].filter(Boolean).join(', ')}
                    </div>
                  </td>
                  <td className="num px-3 py-2.5 text-right">{fmt.int(p.p_balls)}</td>
                  <td className="num px-3 py-2.5 text-right">
                    {role === 'bat' ? fmt.dec(p.press.sr, 0) : fmt.dec(p.press.econ, 2)}
                    <span className="text-ink-3"> / {role === 'bat' ? fmt.dec(p.norm.sr, 0) : fmt.dec(p.norm.econ, 2)}</span>
                  </td>
                  <td className="num px-3 py-2.5 text-right font-semibold">{fmt.signed(p.p_rv100)}</td>
                  <td className="num px-3 py-2.5 text-right text-ink-2">{fmt.signed(p.n_rv100)}</td>
                  <td className={`num px-3 py-2.5 text-right ${p.delta100 >= 0 ? 'text-pink-ink' : 'text-blue'}`}>{fmt.signed(p.delta100)}</td>
                  <td className="num px-3 py-2.5 text-right">{fmt.signed(p.wpa100, 2)}</td>
                  <td className="num px-3 py-2.5 text-right">{fmt.pct(p.cons)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-panel-2">
                        <span className="block h-full rounded-full bg-blue" style={{ width: `${p.boot.p_top10 * 100}%` }} />
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
