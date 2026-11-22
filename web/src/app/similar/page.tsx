import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { PageHead } from '@/components/kit'
import { getLab, getStylePoints } from '@/lib/data'
import { SimilarFinder } from '@/views/SimilarFinder'

export const metadata: Metadata = { title: 'Similar players' }

export default function SimilarPage() {
  const points = getStylePoints()
  const st = getLab().similarity
  return (
    <>
      <PageHead
        title="Similar players"
        summary={
          <>
            A nearest-neighbour recommender: pick a player and get the ten whose game is shaped most like theirs, matched on when they play, how they score or
            concede, and how they handle pressure, with the shared traits that make them alike.{' '}
            <Link href="/lab/#similarity" className="font-semibold text-signal-ink hover:underline">
              How it works and how well it holds up
            </Link>
          </>
        }
      >
        <div className="panel max-w-sm p-4 text-[13px] text-ink-2">
          <span className="eyebrow">Stability check</span>
          <p className="mt-1">
            Rebuilt from odd and even matches separately, a player’s top 10 overlap by <b className="num text-foreground">{Math.round(st.bat.stability.overlap * 100)}%</b> (batters) and{' '}
            <b className="num text-foreground">{Math.round(st.bowl.stability.overlap * 100)}%</b> (bowlers), against about {Math.round(st.bat.stability.chance * 100)}% by chance.
          </p>
        </div>
      </PageHead>
      <Suspense fallback={<div className="panel h-[520px] animate-pulse" />}>
        <SimilarFinder points={points} />
      </Suspense>
    </>
  )
}
