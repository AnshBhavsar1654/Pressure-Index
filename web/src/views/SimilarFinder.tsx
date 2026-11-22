'use client'

import { ArrowsLeftRightIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import { scaleLinear } from 'd3-scale'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { AXIS, Legend, Tooltip, TipRow, useWidth, type TipState } from '@/components/charts/core'
import { Zoomable } from '@/components/charts/Zoom'
import { Segmented } from '@/components/filters'
import { Flag } from '@/components/Flag'
import { Meter, PlayerAvatar, signed } from '@/components/kit'
import { TeamBadge } from '@/components/TeamBadge'
import { Input } from '@/components/ui/input'
import { usePlayerDetail } from '@/lib/usePlayerDetail'
import type { Role, StylePoint } from '@/lib/types'

/** Pick a player; see the ten whose game is shaped most like theirs, why, and where they sit on the style map. */
export function SimilarFinder({ points }: { points: StylePoint[] }) {
  const router = useRouter()
  const params = useSearchParams()
  const role: Role = params.get('role') === 'bowl' ? 'bowl' : 'bat'
  const pool = useMemo(() => points.filter((p) => p.role === role), [points, role])
  const fallback = useMemo(() => pool.filter((p) => p.rank != null).toSorted((a, b) => a.rank! - b.rank!)[0] ?? pool[0], [pool])
  const id = pool.some((p) => p.id === Number(params.get('id'))) ? Number(params.get('id')) : fallback?.id
  const me = pool.find((p) => p.id === id)
  const detail = usePlayerDetail(role, id ? [id] : [])
  const full = id ? detail.get(id) : undefined
  const similar = full?.similar ?? []
  const [q, setQ] = useState('')

  const go = (r: Role, pid?: number) => router.replace(`/similar/?role=${r}${pid ? `&id=${pid}` : ''}`, { scroll: false })
  const suggestions = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? pool.filter((p) => p.name.toLowerCase().includes(t)).slice(0, 8) : []
  }, [q, pool])

  return (
    <div className="flex flex-col gap-5">
      <div className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <Segmented
          label="Batters or bowlers"
          value={role}
          onChange={(r) => (setQ(''), go(r))}
          options={[
            { value: 'bat', label: 'Batters' },
            { value: 'bowl', label: 'Bowlers' },
          ]}
        />
        <div className="relative min-w-0 flex-1">
          <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Find a ${role === 'bat' ? 'batter' : 'bowler'} (${pool.length} with 300+ balls)`}
            className="h-10 rounded-lg pl-9"
            aria-label="Find a player"
          />
          {suggestions.length > 0 && (
            <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-line-strong bg-panel-2">
              {suggestions.map((p) => (
                <li key={p.id}>
                  <button onClick={() => (setQ(''), go(role, p.id))} className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-[14px] hover:bg-panel">
                    <Flag country={p.country} size={16} />
                    {p.name}
                    <span className="num ml-auto text-[12px] text-ink-3">{signed(p.rating)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {me && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <section className="panel flex flex-col gap-4 p-5" aria-label={`Players similar to ${me.name}`}>
            <div className="flex items-center gap-3">
              <PlayerAvatar name={me.name} highlight size={52} />
              <div className="min-w-0">
                <span className="eyebrow">Plays like…</span>
                <h2 className="display text-[1.6rem]">{me.name}</h2>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(full?.style?.traits ?? []).map((t) => (
                    <span key={t} className="rounded-md border border-line bg-panel-2 px-1.5 py-0.5 text-[11.5px] text-ink-2">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            {detail.error && <p className="text-[13.5px] text-ink-2">Could not load this player ({detail.error}). Try another, or reload the page.</p>}
            {!full && !detail.error && <div className="h-80 animate-pulse rounded-lg bg-panel-2" aria-label="Loading similar players" />}
            <ol className="flex flex-col">
              {similar.map((s, i) => {
                const pt = pool.find((p) => p.id === s.id)
                return (
                  <li key={s.id} className="flex flex-col gap-1 border-b border-line py-2.5 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="num w-5 text-[13px] text-ink-3">{i + 1}</span>
                      <button onClick={() => go(role, s.id)} className="truncate text-left text-[14.5px] font-medium hover:underline" title={`Show players similar to ${s.name}`}>
                        {s.name}
                      </button>
                      {pt && <Flag country={pt.country} size={15} />}
                      {pt?.ipl && <TeamBadge team={pt.ipl} size={18} />}
                      <span className="ml-auto flex items-center gap-2">
                        <Meter value={s.sim} className="w-14" tone="data" />
                        <span className="num w-10 text-right text-[13px] font-semibold">{Math.round(s.sim * 100)}%</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-7 text-[12.5px] text-ink-3">
                      <span>{s.why.length ? `Shared: ${s.why.join(', ')}` : 'Similar all-round profile'}</span>
                      {pt && <span className="num">rating {signed(pt.rating)}</span>}
                      <Link href={`/compare/?role=${role}&ids=${me.id},${s.id}`} className="inline-flex items-center gap-1 font-medium text-signal-ink hover:underline">
                        <ArrowsLeftRightIcon size={13} /> Compare
                      </Link>
                    </div>
                  </li>
                )
              })}
            </ol>
            <Link href={`/players/${role}/${me.id}/`} className="text-[13.5px] font-semibold text-signal-ink hover:underline">
              Open {me.name}’s profile
            </Link>
          </section>

          <section className="panel flex flex-col gap-3 p-5" aria-label="Style map">
            <div>
              <h3 className="display text-[1.3rem]">Style map</h3>
              <p className="text-[13px] text-ink-2">
                Every {role === 'bat' ? 'batter' : 'bowler'} with 300+ balls, placed by the first two principal components of their standardised style profile. Click any
                dot to make it the selected player.
              </p>
            </div>
            <Legend
              items={[
                { label: me.name, color: 'var(--signal)' },
                { label: 'Ten most similar', color: 'var(--data)' },
                { label: 'Everyone else', color: 'var(--neutral-mark)' },
              ]}
            />
            <Zoomable label="style map">
              <StyleMap points={pool} selected={me.id} neighbours={new Set(similar.map((s) => s.id))} onSelect={(pid) => go(role, pid)} />
            </Zoomable>
          </section>
        </div>
      )}
    </div>
  )
}

function StyleMap({ points, selected, neighbours, onSelect }: { points: StylePoint[]; selected: number; neighbours: Set<number>; onSelect: (id: number) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState | null>(null)
  const height = 420
  const m = { t: 14, r: 14, b: 26, l: 14 }
  const x = scaleLinear().domain([Math.min(...points.map((p) => p.x)), Math.max(...points.map((p) => p.x))]).nice().range([m.l, width - m.r])
  const y = scaleLinear().domain([Math.min(...points.map((p) => p.y)), Math.max(...points.map((p) => p.y))]).nice().range([height - m.b, m.t])
  const kind = (p: StylePoint) => (p.id === selected ? 2 : neighbours.has(p.id) ? 1 : 0)
  const ordered = points.toSorted((a, b) => kind(a) - kind(b))
  const me = points.find((p) => p.id === selected)
  return (
    <div ref={ref} className="relative w-full min-w-0">
      <svg width={width} height={height} role="img" aria-label="Style map: selected player and their ten nearest neighbours">
        <line x1={x(0)} x2={x(0)} y1={m.t} y2={height - m.b} stroke={AXIS.grid} />
        <line x1={m.l} x2={width - m.r} y1={y(0)} y2={y(0)} stroke={AXIS.grid} />
        {me &&
          points
            .filter((p) => neighbours.has(p.id))
            .map((p) => <line key={`l${p.id}`} x1={x(me.x)} y1={y(me.y)} x2={x(p.x)} y2={y(p.y)} stroke="var(--data)" strokeOpacity={0.35} />)}
        {ordered.map((p) => {
          const k = kind(p)
          return (
            <circle
              key={p.id}
              cx={x(p.x)}
              cy={y(p.y)}
              r={k === 2 ? 8 : k === 1 ? 6 : 4}
              fill={k === 2 ? 'var(--signal)' : k === 1 ? 'var(--data)' : 'var(--neutral-mark)'}
              stroke="var(--panel)"
              strokeWidth={2}
              className="cursor-pointer"
              onClick={() => onSelect(p.id)}
              onPointerEnter={(e) => {
                const r = ((e.currentTarget as SVGElement).ownerSVGElement as SVGSVGElement).getBoundingClientRect()
                setTip({
                  x: e.clientX - r.left,
                  y: e.clientY - r.top,
                  content: (
                    <div className="flex flex-col gap-0.5">
                      <div className="font-semibold">{p.name}</div>
                      <TipRow label="Pressure rating" value={signed(p.rating)} />
                      {p.rank != null && <TipRow label="Rank" value={p.rank} />}
                    </div>
                  ),
                })
              }}
              onPointerLeave={() => setTip(null)}
            />
          )
        })}
        {me && (
          <text x={x(me.x)} y={y(me.y) - 13} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--ink)">
            {me.name}
          </text>
        )}
        <text x={width - m.r} y={height - 6} textAnchor="end" {...AXIS.label}>
          component 1 →
        </text>
        <text x={m.l + 2} y={m.t + 10} {...AXIS.label}>
          ↑ component 2
        </text>
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  )
}
