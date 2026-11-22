import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PageHead } from '@/components/kit'
import { getMatches, getSummary } from '@/lib/data'
import { fmt } from '@/lib/format'
import { MatchExplorer } from '@/views/MatchExplorer'

export const metadata: Metadata = { title: 'Match explorer' }

export default function MatchesPage() {
  const matches = getMatches()
  const s = getSummary()
  return (
    <>
      <PageHead
        title="Match explorer"
        summary={
          <>
            Every one of the {fmt.int(matches.length)} top-level and World Cup matches since {s.seasons[0]}, ball by ball: the modelled win probability, where the
            pressure fell, the biggest swings and who added the most runs against an average player.
          </>
        }
      />
      <Suspense fallback={<div className="panel h-[520px] animate-pulse" />}>
        <MatchExplorer matches={matches} />
      </Suspense>
    </>
  )
}
