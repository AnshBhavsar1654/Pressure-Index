'use client'

import { scaleLinear } from 'd3-scale'
import { useState } from 'react'
import { signed } from '@/components/ui'
import { fmt, iplCode } from '@/lib/format'
import type { RRMatch, RRPhase } from '@/lib/types'
import { AXIS, Tooltip, TipRow, useWidth, type TipState } from './core'
import { WinWorm } from './WinWorm'

const RR = 'Rajasthan Royals'

/** Sixteen tiles (one per match) that open the full win-probability story below. */
export function SeasonExplorer({ matches }: { matches: RRMatch[] }) {
  const [sel, setSel] = useState(() => matches.findIndex((m) => m.stage === 'Qualifier'))
  const m = matches[sel] ?? matches[0]
  const s1 = m.scores['1']
  const s2 = m.scores['2']
  return (
    <div className="panel overflow-hidden">
      <div className="grid grid-cols-4 gap-px bg-line sm:grid-cols-8">
        {matches.map((x, i) => (
          <button
            key={x.id}
            onClick={() => setSel(i)}
            aria-pressed={i === sel}
            aria-label={`${x.won ? 'Won' : 'Lost'} against ${x.opp}, ${fmt.date(x.date)}`}
            className={`flex flex-col gap-1 px-2.5 pb-2 pt-2.5 text-left transition-colors ${i === sel ? 'bg-panel-2' : 'bg-panel hover:bg-panel-2'}`}
          >
            <span className="flex items-center justify-between gap-1">
              <span className={`display text-[1.25rem] ${x.won ? 'text-pink' : 'text-blue'}`}>{x.won ? 'W' : 'L'}</span>
              <span className="text-[12px] font-semibold text-ink-2">{iplCode(x.opp)}</span>
            </span>
            <WinWorm worm={x.worm} compact height={34} />
            <span className="text-[11px] text-ink-3">
              {x.stage === 'League' ? fmt.date(x.date).replace(/ \d{4}$/, '') : x.stage === 'Qualifier' ? 'Qualifier 2' : x.stage}
            </span>
            {i === sel && <span className="h-[3px] rounded-full bg-pink" />}
          </button>
        ))}
      </div>
      <div className="grid gap-6 border-t border-line p-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="display text-[1.7rem]">
              {m.stage === 'League' ? '' : `${m.stage === 'Qualifier' ? 'Qualifier 2' : m.stage}: `}RR v {m.opp}
            </h3>
            <span className="text-[13.5px] text-ink-3">{fmt.date(m.date)}</span>
          </div>
          <WinWorm worm={m.worm} height={250} labels={{ first: `${s1.team} batting`, second: `${s2.team} batting` }} />
        </div>
        <dl className="flex flex-col gap-3 text-[13.5px]">
          <div>
            <dt className="text-ink-3">Result</dt>
            <dd className={`font-semibold ${m.won ? 'text-pink-ink' : 'text-blue'}`}>{m.result}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Scores</dt>
            <dd className="num">
              {iplCode(s1.team)} {s1.runs}/{s1.wkts}, {iplCode(s2.team)} {s2.runs}/{s2.wkts}
            </dd>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-ink-3">RR batting</dt>
              <dd className={`display num text-[1.6rem] ${m.bat_rv >= 0 ? 'text-pink' : 'text-blue'}`}>{signed(m.bat_rv, 0)}</dd>
            </div>
            <div>
              <dt className="text-ink-3">RR bowling</dt>
              <dd className={`display num text-[1.6rem] ${m.bowl_rv >= 0 ? 'text-pink' : 'text-blue'}`}>{signed(m.bowl_rv, 0)}</dd>
            </div>
            <dd className="col-span-2 -mt-2 text-[12px] text-ink-3">runs compared with an average IPL side in the same situations</dd>
          </div>
          <div>
            <dt className="text-ink-3">Best for RR</dt>
            <dd>
              {m.best.bat} (bat), {m.best.bowl} (ball)
            </dd>
          </div>
          <div>
            <dt className="text-ink-3">Cost RR most</dt>
            <dd>
              {m.worst.bat} (bat), {m.worst.bowl} (ball)
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

/**
 * Runs per match RR gained (pink) or lost (blue) in each phase compared with an average
 * IPL 2026 side, batting and bowling, with the top-four average marked.
 */
export function PhaseGaps({ phases }: { phases: RRPhase[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState | null>(null)
  const rows = phases.flatMap((p) =>
    (['bat', 'bowl'] as const).map((d) => ({
      key: `${d}-${p.phase}`,
      label: `${d === 'bat' ? 'Batting' : 'Bowling'}, ${p.phase === 'Middle' ? 'middle overs' : p.phase.toLowerCase()}`,
      sub: p.overs,
      v: p.rr[`${d}_rv_pm`],
      top4: p.top4[`${d}_rv_pm`],
      rank: d === 'bat' ? p.bat_rank : p.bowl_rank,
    })),
  )
  const rowH = 46
  const m = { t: 26, r: 56, b: 30, l: Math.min(210, width * 0.38) }
  const height = m.t + rows.length * rowH + m.b
  const ext = Math.max(6, ...rows.map((r) => Math.abs(r.v)), ...rows.map((r) => Math.abs(r.top4))) + 1
  const x = scaleLinear().domain([-ext, ext]).range([m.l, width - m.r])
  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-x-clip">
      <svg width={width} height={height} role="img" aria-label="Runs gained or lost per match by phase">
        <text x={x(-ext)} y={14} {...AXIS.label} fill="var(--blue)" fontWeight={600}>
          ← runs lost
        </text>
        <text x={x(ext)} y={14} textAnchor="end" {...AXIS.label} fill="var(--pink-ink)" fontWeight={600}>
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
          const x0 = x(Math.min(0, r.v))
          const w = Math.abs(x(r.v) - x(0))
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
                      <TipRow label="RR per match" value={`${signed(r.v)} runs`} />
                      <TipRow label="Top-four average" value={`${signed(r.top4)} runs`} />
                      <TipRow label="Rank of 10" value={r.rank} />
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
                {r.sub}, ranked {r.rank} of 10
              </text>
              <rect x={x0} y={cy - 9} width={Math.max(2, w)} height={18} rx={3} fill={r.v >= 0 ? 'var(--pink)' : 'var(--blue)'} />
              <line x1={x(r.top4)} x2={x(r.top4)} y1={cy - 14} y2={cy + 14} stroke="var(--ink)" strokeWidth={2} />
              <text
                x={r.v >= 0 ? x(r.v) + 6 : x(r.v) - 6}
                y={cy}
                dy="0.32em"
                textAnchor={r.v >= 0 ? 'start' : 'end'}
                fontSize={12.5}
                fontWeight={700}
                fill="var(--ink)"
                className="num"
              >
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

/** One dot per IPL team on a single scale, RR highlighted: "where does RR sit?" */
export function TeamDots({
  title,
  rows,
  unit = 'runs per 100 balls',
}: {
  title: string
  rows: { team: string; v: number }[]
  unit?: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState | null>(null)
  const height = 74
  const m = { l: 8, r: 8 }
  const vals = rows.map((r) => r.v)
  const ext = Math.max(...vals.map(Math.abs), 5) + 2
  const x = scaleLinear().domain([-ext, ext]).range([m.l, width - m.r])
  const rr = rows.find((r) => r.team === RR)
  const rank = [...rows].sort((a, b) => b.v - a.v).findIndex((r) => r.team === RR) + 1
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-semibold">{title}</span>
        <span className="num text-[13px] text-ink-2">
          RR <b className={rr && rr.v >= 0 ? 'text-pink-ink' : 'text-blue'}>{signed(rr?.v)}</b>, {rank} of {rows.length}
        </span>
      </div>
      <div ref={ref} className="relative w-full min-w-0 overflow-x-clip">
        <svg width={width} height={height} role="img" aria-label={`${title}: Rajasthan Royals ranked ${rank} of ${rows.length}`}>
          <line x1={m.l} x2={width - m.r} y1={36} y2={36} stroke={AXIS.grid} strokeWidth={6} strokeLinecap="round" />
          <line x1={x(0)} x2={x(0)} y1={24} y2={48} stroke={AXIS.rule} />
          <text x={x(0)} y={64} textAnchor="middle" {...AXIS.tick}>
            average
          </text>
          {rows
            .filter((r) => r.team !== RR)
            .map((r) => (
              <circle
                key={r.team}
                cx={x(r.v)}
                cy={36}
                r={6}
                fill="var(--neutral-mark)"
                stroke="var(--panel)"
                strokeWidth={2}
                onPointerEnter={(e) => {
                  const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
                  setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, content: <TipRow label={r.team} value={`${signed(r.v)} ${unit}`} /> })
                }}
                onPointerLeave={() => setTip(null)}
              />
            ))}
          {rr && (
            <g>
              <circle cx={x(rr.v)} cy={36} r={9} fill="var(--pink)" stroke="var(--panel)" strokeWidth={2.5} />
              <text x={x(rr.v)} y={18} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="var(--pink-ink)">
                RR
              </text>
            </g>
          )}
        </svg>
        <Tooltip tip={tip} width={width} />
      </div>
    </div>
  )
}
