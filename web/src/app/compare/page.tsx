import type { Metadata } from 'next'
import { PageHead } from '@/components/kit'
import { getRole } from '@/lib/data'
import type { Player, Role } from '@/lib/types'
import { CompareView } from '@/views/CompareView'

export const metadata: Metadata = { title: 'Compare players' }

// the compare page needs season and phase detail but never the match-by-match list
const slim = (p: Player): Player => ({ ...p, matches: [], moments: [] })

export default function ComparePage() {
  const pools = Object.fromEntries((['bat', 'bowl'] as Role[]).map((r) => [r, getRole(r).players.map(slim)])) as Record<Role, Player[]>
  return (
    <>
      <PageHead
        title="Compare players"
        summary="Pick up to three batters or three bowlers and line them up on the same measures: pressure rating, usual level, lift, win impact, consistency and season by season form."
      />
      <CompareView pools={pools} />
    </>
  )
}
