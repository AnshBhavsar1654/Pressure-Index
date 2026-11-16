'use client'

import { useMemo, useState } from 'react'
import { NAT_OPTIONS, natMatch, Segmented, type Nat } from '@/components/filters'
import { PlayerAvatar, signed } from '@/components/kit'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { SquadPlayer } from '@/lib/types'
import { cn } from '@/lib/utils'

type Usage = 'all' | 'regular'
type Kind = 'bat' | 'bowl'

/** RR squad, batting and bowling side by side, with shared filters. */
export function SquadTables({ squad }: { squad: SquadPlayer[] }) {
  const [nat, setNat] = useState<Nat>('all')
  const [usage, setUsage] = useState<Usage>('all')
  const pick = (kind: Kind) =>
    squad
      .filter((p) => p[kind] && p[kind]!.balls >= (kind === 'bat' ? 10 : 12))
      .filter((p) => natMatch(nat, p.nat, p.overseas) && (usage === 'all' || p[kind]!.balls >= 60))
      .toSorted((a, b) => b[kind]!.rv - a[kind]!.rv)
  const bat = useMemo(() => pick('bat'), [squad, nat, usage]) // eslint-disable-line react-hooks/exhaustive-deps
  const bowl = useMemo(() => pick('bowl'), [squad, nat, usage]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Nationality" value={nat} onChange={setNat} options={NAT_OPTIONS} />
        <Segmented
          label="Workload"
          value={usage}
          onChange={setUsage}
          options={[
            { value: 'all', label: 'Everyone' },
            { value: 'regular', label: 'Regulars, 60+ balls' },
          ]}
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <SquadTable title="Batting" rows={bat} kind="bat" />
        <SquadTable title="Bowling" rows={bowl} kind="bowl" />
      </div>
    </div>
  )
}

function SquadTable({ title, rows, kind }: { title: string; rows: SquadPlayer[]; kind: Kind }) {
  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="border-b pb-4">
        <CardTitle>{title}</CardTitle>
        <CardDescription>Death and pressure columns are runs added per 100 balls, shown from 12 balls. Runs added is the season total.</CardDescription>
      </CardHeader>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-[14px] text-ink-3">No squad player matches these filters.</p>
      ) : (
        <Table className="min-w-[560px] text-[13.5px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5 text-ink-3">Player</TableHead>
              <TableHead className="text-right text-ink-3">{kind === 'bat' ? 'Runs' : 'Wickets'}</TableHead>
              <TableHead className="text-right text-ink-3">{kind === 'bat' ? 'Strike rate' : 'Economy'}</TableHead>
              <TableHead className="text-right text-ink-3">Death</TableHead>
              <TableHead className="text-right text-ink-3">Pressure</TableHead>
              <TableHead className="pr-5 text-right text-ink-3">Runs added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => {
              const d = p[kind]!
              const death = d.phases.Death
              return (
                <TableRow key={p.id}>
                  <TableCell className="py-2 pl-5">
                    <span className="flex items-center gap-2.5">
                      <PlayerAvatar name={p.name} rr size={30} />
                      <span>
                        <span className="font-medium">{p.name}</span>
                        {p.overseas && <span className="ml-1.5 text-[11.5px] text-ink-3">overseas</span>}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="num text-right">{kind === 'bat' ? p.bat!.runs : p.bowl!.wkts}</TableCell>
                  <TableCell className="num text-right">{kind === 'bat' ? p.bat!.sr : p.bowl!.econ}</TableCell>
                  <TableCell className="num text-right text-ink-2" title={`${death.balls} balls at the death`}>
                    {death.balls >= 12 ? signed(death.rv100, 0) : '–'}
                  </TableCell>
                  <TableCell className="num text-right text-ink-2" title={`${d.p_balls} pressure balls`}>
                    {d.p_balls >= 12 ? signed(d.p_rv100, 0) : '–'}
                  </TableCell>
                  <TableCell className={cn('num pr-5 text-right font-semibold', d.rv >= 0 ? 'text-pink-ink' : 'text-blue')}>{signed(d.rv, 0)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}
