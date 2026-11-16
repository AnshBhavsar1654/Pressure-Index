'use client'

import { useMemo, useState } from 'react'
import { Segmented } from '@/components/filters'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fmt } from '@/lib/format'
import type { Summary } from '@/lib/types'

type Comp = 'all' | 'ipl' | 't20i'

/** The single highest-stakes ball of each match, filterable by competition. */
export function MomentsTable({ moments }: { moments: Summary['moments'] }) {
  const [comp, setComp] = useState<Comp>('all')
  const rows = useMemo(
    () => moments.filter((m) => comp === 'all' || (comp === 'ipl' ? m.comp.startsWith('IPL') : !m.comp.startsWith('IPL'))),
    [moments, comp],
  )
  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center gap-2 px-5 py-3">
        <Segmented
          label="Competition"
          value={comp}
          onChange={setComp}
          options={[
            { value: 'all', label: 'All' },
            { value: 'ipl', label: 'IPL' },
            { value: 't20i', label: 'T20 internationals' },
          ]}
        />
        <span className="ml-auto text-[12.5px] text-ink-3">{rows.length} matches</span>
      </div>
      <Table className="min-w-[760px] border-t text-[13.5px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5 text-ink-3">Match</TableHead>
            <TableHead className="text-ink-3">Situation</TableHead>
            <TableHead className="text-ink-3">Batter v bowler</TableHead>
            <TableHead className="text-right text-ink-3">Chasing side’s win chance</TableHead>
            <TableHead className="pr-5 text-right text-ink-3">Stakes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((mo) => (
            <TableRow key={mo.match + mo.date}>
              <TableCell className="py-2.5 pl-5">
                <div className="font-medium">{mo.match}</div>
                <div className="text-[12px] text-ink-3">
                  {mo.comp}, {fmt.date(mo.date)}
                </div>
              </TableCell>
              <TableCell>{mo.state}</TableCell>
              <TableCell>
                {mo.striker} v {mo.bowler}
              </TableCell>
              <TableCell className="num text-right">{fmt.pct(mo.wp)}</TableCell>
              <TableCell className="display num pr-5 text-right text-[1.4rem] text-pink" title="Stakes compared with a typical ball">
                {mo.li.toFixed(0)}×
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
