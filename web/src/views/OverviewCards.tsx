'use client'

import Link from 'next/link'
import { Flag } from '@/components/Flag'
import { signed } from '@/components/kit'
import { Term } from '@/components/Term'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fmt } from '@/lib/format'
import type { Role } from '@/lib/types'

export type RankedPlayer = {
  id: number
  name: string
  rank: number
  country: string | null
  rating: number
  confidence: number
  rate: number | null
}

function Rankings({ players, role }: { players: RankedPlayer[]; role: Role }) {
  const first = players[0]
  const isBatter = role === 'bat'
  const noun = isBatter ? 'batters' : 'bowlers'
  const rate = isBatter ? 'Strike rate' : 'Economy'

  return (
    <>
      {first && (
        <div className="border-b border-line bg-panel-2/70 px-3 py-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs font-medium text-ink-3">Rank 1</span>
            <Flag country={first.country} size={18} />
            <Link href={`/players/${role}/${first.id}/`} className="font-semibold underline-offset-4 hover:underline">{first.name}</Link>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2">
            <div>
              <dt className="text-xs text-ink-3"><Term k="underPressure" role={role}>Rating</Term></dt>
              <dd className="num text-lg font-semibold">{signed(first.rating)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">{rate}</dt>
              <dd className="num text-lg font-medium">{fmt.dec(first.rate, isBatter ? 0 : 2)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3"><Term k="confidence">Top 10 chance</Term></dt>
              <dd className="num text-lg font-medium">{fmt.pct(first.confidence)}</dd>
            </div>
          </dl>
        </div>
      )}
      <Table>
        <TableCaption className="sr-only">Top ten {noun} by pressure rating</TableCaption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className="h-8 w-8 pl-3 text-xs text-ink-3">#</TableHead>
            <TableHead scope="col" className="h-8 px-0 text-xs text-ink-3">Player</TableHead>
            <TableHead scope="col" className="h-8 text-right text-xs text-ink-3"><Term k="underPressure" role={role}>Rating</Term></TableHead>
            <TableHead scope="col" className="h-8 pr-3 text-right text-xs text-ink-3"><Term k="confidence">Top 10</Term></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {players.map((p) => (
            <TableRow key={p.id} className="focus-within:bg-panel-2">
              <TableCell className="num pl-3 text-ink-3">{p.rank}</TableCell>
              <th scope="row" className="py-2 text-left font-medium">
                <Link className="underline-offset-4 hover:underline" href={`/players/${role}/${p.id}/`}>{p.name}</Link>
              </th>
              <TableCell className="num text-right text-ink-2">{signed(p.rating)}</TableCell>
              <TableCell className="num pr-3 text-right text-ink-3">{fmt.pct(p.confidence)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Link
        className="flex min-h-11 items-center border-y border-line px-3 text-sm font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:bg-panel-2"
        href={`/rankings/${role}/`}
      >
        All {noun}
      </Link>
    </>
  )
}

export function TopTen({ bat, bowl }: { bat: RankedPlayer[]; bowl: RankedPlayer[] }) {
  return (
    <section className="min-w-0 border-t-2 border-ink bg-panel" aria-labelledby="overview-rankings">
      <h2 id="overview-rankings" className="display px-3 pt-4 text-xl sm:text-2xl">Top 10 under pressure</h2>
      <Tabs defaultValue="bat" className="gap-0">
        <div className="border-b border-line px-3">
          <TabsList variant="line" aria-label="Ranking role" className="h-10! p-0">
            <TabsTrigger value="bat" className="px-2 after:bottom-0 after:bg-ink">Batters</TabsTrigger>
            <TabsTrigger value="bowl" className="px-2 after:bottom-0 after:bg-ink">Bowlers</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="bat"><Rankings players={bat} role="bat" /></TabsContent>
        <TabsContent value="bowl"><Rankings players={bowl} role="bowl" /></TabsContent>
      </Tabs>
    </section>
  )
}
