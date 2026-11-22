'use client'

import { useState } from 'react'
import { ArchetypeMap, type ArchPoint } from '@/components/charts/LabCharts'
import { Segmented } from '@/components/filters'
import type { Role } from '@/lib/types'

export type ArchMeta = Record<Role, { k: number; silhouette: number; explained: number[]; clusters: { name: string; size: number; centroid: Record<string, number> }[] }>

export function ArchetypeSection({ points, meta }: { points: ArchPoint[]; meta: ArchMeta }) {
  const [role, setRole] = useState<Role>('bat')
  const m = meta[role]
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Batters or bowlers" value={role} onChange={setRole} options={[{ value: 'bat', label: 'Batters' }, { value: 'bowl', label: 'Bowlers' }]} />
        <span className="num text-[12.5px] text-ink-3">
          k = {m.k} · silhouette {m.silhouette.toFixed(3)} · PCA explains {Math.round(100 * (m.explained[0] + m.explained[1]))}% of variance
        </span>
      </div>
      <ArchetypeMap key={role} points={points.filter((p) => p.role === role)} clusters={m.clusters} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[12.5px]">
          <thead className="text-ink-3">
            <tr className="border-b border-line">
              <th className="py-1.5 text-left font-medium">Archetype (centroid)</th>
              <th className="py-1.5 text-right font-medium">Powerplay</th>
              <th className="py-1.5 text-right font-medium">Middle</th>
              <th className="py-1.5 text-right font-medium">Death</th>
              <th className="py-1.5 text-right font-medium">{role === 'bat' ? 'Strike rate' : 'Economy'}</th>
              <th className="py-1.5 text-right font-medium">Boundary %</th>
              <th className="py-1.5 text-right font-medium">Dot %</th>
              <th className="py-1.5 text-right font-medium">Usual level</th>
            </tr>
          </thead>
          <tbody>
            {m.clusters.map((c) => (
              <tr key={c.name} className="border-b border-line last:border-0">
                <td className="py-1.5 font-medium">{c.name}</td>
                {(['powerplay', 'middle', 'death'] as const).map((k) => (
                  <td key={k} className="num py-1.5 text-right">
                    {Math.round(c.centroid[k] * 100)}%
                  </td>
                ))}
                <td className="num py-1.5 text-right">{c.centroid.pace.toFixed(role === 'bat' ? 0 : 2)}</td>
                <td className="num py-1.5 text-right">{c.centroid.boundary.toFixed(1)}</td>
                <td className="num py-1.5 text-right">{c.centroid.dot.toFixed(1)}</td>
                <td className="num py-1.5 text-right">{c.centroid.usual > 0 ? '+' : ''}{c.centroid.usual.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[12px] text-ink-3">Phase columns: share of the archetype’s balls in each phase. Silhouette scores are flat (≈0.2) across k, so these are useful descriptions, not hard boundaries.</p>
      </div>
    </div>
  )
}
