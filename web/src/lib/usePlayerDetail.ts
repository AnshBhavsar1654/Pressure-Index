'use client'

import { useEffect, useState } from 'react'
import type { Player, Role } from './types'

/** Full player records (seasons, phases, matches, similar players), fetched on demand from /data/players/. */
const cache = new Map<string, Promise<Player>>()

export function fetchPlayer(role: Role, id: number): Promise<Player> {
  const key = `${role}/${id}`
  if (!cache.has(key)) {
    cache.set(
      key,
      fetch(`/data/players/${key}.json`).then((r) => {
        if (!r.ok) {
          cache.delete(key)
          throw new Error(`HTTP ${r.status}`)
        }
        return r.json() as Promise<Player>
      }),
    )
  }
  return cache.get(key)!
}

/** Detail for a list of players: { [id]: Player } once loaded; missing ids are still loading. */
export function usePlayerDetail(role: Role, ids: number[]) {
  const [detail, setDetail] = useState<Record<string, Player>>({})
  const [error, setError] = useState<string | null>(null)
  const key = `${role}:${ids.join(',')}`
  useEffect(() => {
    let live = true
    Promise.all(ids.map((id) => fetchPlayer(role, id)))
      .then((ps) => live && setDetail((d) => ({ ...d, ...Object.fromEntries(ps.map((p) => [`${role}/${p.id}`, p])) })))
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return { get: (id: number) => detail[`${role}/${id}`], error }
}
