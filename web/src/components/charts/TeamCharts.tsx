'use client'

import { scaleLinear } from 'd3-scale'
import Link from 'next/link'
import { useState } from 'react'
import { ordinal, signed } from '@/components/kit'
import { TeamBadge } from '@/components/TeamBadge'
import { fmt } from '@/lib/format'
import type { TeamMatch, TeamPhase } from '@/lib/types'
import { AXIS, Tooltip, TipRow, useWidth, type TipState } from './core'

/** Runs per match gained or lost against an average side, by phase, batting and bowling. */
export function PhaseGaps({ phases, nTeams }: { phases: TeamPhase[]; nTeams: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState | null>(null)
  const rows = phases.flatMap((p) =>
    (['bat', 'bowl'] as const).map((d) => ({
      key: `${d}-${p.phase}`,
      label: `${d === 'bat' ? 'Batting' : 'Bowling'}, ${p.phase === 'Middle' ? 'middle overs' : p.phase.toLowerCase()}`,
      sub: p.overs,
      v: p[d],
      rpo: d === 'bat' ? p.bat_rpo : p.bowl_rpo,
      rank: d === 'bat' ? p.bat_rank : p.bowl_rank,
    })),
  )
  const rowH = 46
  const m = { t: 26, r: 56, b: 30, l: Math.min(210, width * 0.38) }
  const height = m.t + rows.length * rowH + m.b
  const ext = Math.max(6, ...rows.map((r) => Math.abs(r.v))) + 1
  const x = scaleLinear().domain([-ext, ext]).range([m.l, width - m.r])
  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-x-clip">
      <svg width={width} height={height} role="img" aria-label="Runs gained or lost per match by phase">
        <text x={x(-ext)} y={14} {...AXIS.label} fill="var(--data-ink)" fontWeight={600}>
          ← runs lost
        </text>
        <text x={x(ext)} y={14} textAnchor="end" {...AXIS.label} fill="var(--signal-ink)" fontWeight={600}>
          runs gained →
        </text>
        {x.ticks(6).map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={m.t} y2={height - m.b} stroke={t === 0 ? AXIS.rule : AXIS.grid} />
            <text x={x(t)} y={height - m.b + 16} textAnchor="middle" {...AXIS.tick} className="num">
              {signed(t, 0)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cy = m.t + i * rowH + rowH / 2
          return (
            <g
              key={r.key}
              onPointerEnter={(e) => {
                const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
                setTip({
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                  content: (
                    <div className="flex flex-col gap-1">
                      <div className="font-semibold">{r.label}</div>
                      <TipRow label="Per match vs average" value={`${signed(r.v)} runs`} />
                      <TipRow label="Runs per over" value={r.rpo.toFixed(2)} />
                      <TipRow label="League rank" value={`${r.rank} of ${nTeams}`} />
                    </div>
                  ),
                })
              }}
              onPointerLeave={() => setTip(null)}
            >
              <rect x={0} y={cy - rowH / 2} width={width} height={rowH} fill="transparent" />
              <text x={m.l - 12} y={cy - 5} textAnchor="end" fontSize={13} fontWeight={600} fill="var(--ink)">
                {r.label}
              </text>
              <text x={m.l - 12} y={cy + 11} textAnchor="end" fontSize={11.5} fill="var(--ink-3)">
                {r.sub}, {ordinal(r.rank)} of {nTeams}
              </text>
              <rect x={x(Math.min(0, r.v))} y={cy - 9} width={Math.max(2, Math.abs(x(r.v) - x(0)))} height={18} rx={4} fill={r.v >= 0 ? 'var(--signal)' : 'var(--data)'} />
              <text x={r.v >= 0 ? x(r.v) + 6 : x(r.v) - 6} y={cy} dy="0.32em" textAnchor={r.v >= 0 ? 'start' : 'end'} fontSize={12.5} fontWeight={600} fill="var(--ink)" className="num">
                {signed(r.v)}
              </text>
            </g>
          )
        })}
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  )
}

/** One tile per match of the season; each opens the match explorer. W/L in text, never colour alone. */
export function SeasonStrip({ matches, team }: { matches: TeamMatch[]; team: string }) {
  return (
    <div className="grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-6 lg:grid-cols-8">
      {matches.map((m) => {
        const us = Object.values(m.scores).find((s) => s.team === team)
        const them = Object.values(m.scores).find((s) => s.team !== team)
        return (
          <Link
            key={m.id}
            href={`/matches/?id=${m.id}`}
            aria-label={`${m.won == null ? 'No result' : m.won ? 'Won' : 'Lost'} against ${m.opp}, ${fmt.date(m.date)}`}
            className="flex flex-col gap-1 bg-panel px-2.5 py-2 transition-colors hover:bg-panel-2"
          >
            <span className="flex items-center justify-between gap-1">
              <span className={`num text-[14px] font-semibold ${m.won ? 'text-signal-ink' : m.won === false ? 'text-data-ink' : 'text-ink-3'}`}>
                {m.won == null ? 'NR' : m.won ? 'W' : 'L'}
              </span>
              <TeamBadge team={m.opp} size={20} />
            </span>
            <span className="num text-[11.5px] text-ink-2">
              {us ? `${us.runs}/${us.wkts}` : '–'} <span className="text-ink-3">v {them ? `${them.runs}/${them.wkts}` : '–'}</span>
            </span>
            <span className="text-[11px] text-ink-3">{m.stage === 'League' ? fmt.date(m.date).replace(/ \d{4}$/, '') : m.stage}</span>
          </Link>
        )
      })}
    </div>
  )
}
