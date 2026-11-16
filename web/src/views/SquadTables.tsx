'use client'

import { useMemo, useState } from 'react'
import { NAT_OPTIONS, natMatch, Segmented, type Nat } from '@/components/filters'
import { OverseasMark, PlayerAvatar, signed } from '@/components/kit'
import { Slider } from '@/components/ui/slider'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { SquadPlayer } from '@/lib/types'
import { cn } from '@/lib/utils'

type Kind = 'bat' | 'bowl'

/** RR squad, batting and bowling side by side, with shared filters. */
export function SquadTables({ squad }: { squad: SquadPlayer[] }) {
  const [nat, setNat] = useState<Nat>('all')
  const [minBalls, setMinBalls] = useState(10)
  const pick = (kind: Kind) =>
    squad
      .filter((p) => p[kind] && p[kind]!.balls >= minBalls && natMatch(nat, p.nat, p.overseas))
      .toSorted((a, b) => b[kind]!.rv - a[kind]!.rv)
  const bat = useMemo(() => pick('bat'), [squad, nat, minBalls]) // eslint-disable-line react-hooks/exhaustive-deps
  const bowl = useMemo(() => pick('bowl'), [squad, nat, minBalls]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Nationality" value={nat} onChange={setNat} options={NAT_OPTIONS} />
        <div className="flex min-w-64 items-center gap-3 rounded-lg border border-line bg-panel-2 px-3 py-1.5">
          <span id="squad-min" className="shrink-0 text-[12.5px] text-ink-2">
            Min balls in 2026
          </span>
          <Slider aria-labelledby="squad-min" min={1} max={200} step={1} value={[minBalls]} onValueChange={([v]) => setMinBalls(v)} />
          <span className="display num w-9 text-right text-[1.3rem] text-pink">{minBalls}</span>
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <SquadTable title="Batting" rows={bat} kind="bat" />
        <SquadTable title="Bowling" rows={bowl} kind="bowl" />
      </div>
    </div>
  )
}

type Col = 'count' | 'rate' | 'death' | 'pressure' | 'rv'

/** Value used to sort a column, oriented so that "best" always sorts first. */
function score(p: SquadPlayer, kind: Kind, col: Col): number {
  const d = p[kind]!
  switch (col) {
    case 'count':
      return kind === 'bat' ? p.bat!.runs : p.bowl!.wkts
    case 'rate':
      return kind === 'bat' ? p.bat!.sr : -p.bowl!.econ // lower economy is better
    case 'death':
      return d.phases.Death.balls >= 12 ? (d.phases.Death.rv100 ?? -1e9) : -1e9 // too few balls: last
    case 'pressure':
      return d.p_balls >= 12 ? (d.p_rv100 ?? -1e9) : -1e9
    default:
      return d.rv
  }
}

function SquadTable({ title, rows: base, kind }: { title: string; rows: SquadPlayer[]; kind: Kind }) {
  const [sort, setSort] = useState<{ col: Col; best: boolean }>({ col: 'rv', best: true })
  const rows = useMemo(
    () => base.toSorted((a, b) => (score(b, kind, sort.col) - score(a, kind, sort.col)) * (sort.best ? 1 : -1)),
    [base, kind, sort],
  )
  const head = (col: Col, label: string, last = false) => (
    <TableHead
      className={cn('text-right text-ink-3', last && 'pr-5')}
      aria-sort={sort.col === col ? (sort.best ? 'descending' : 'ascending') : 'none'}
    >
      <button
        className={cn('inline-flex items-center gap-1 hover:text-foreground', sort.col === col && 'font-semibold text-foreground')}
        onClick={() => setSort((s) => ({ col, best: s.col === col ? !s.best : true }))}
        title={sort.col === col && sort.best ? 'Showing best first; click for worst first' : 'Sort best first'}
      >
        {label}
        {sort.col === col && <span aria-hidden>{sort.best ? '↓' : '↑'}</span>}
      </button>
    </TableHead>
  )
  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="border-b pb-4">
        <CardTitle>{title}</CardTitle>
        <CardDescription>Sorted best to worst by runs added; click any column to re-sort. Death and pressure are runs added per 100 balls (from 12 balls); runs added is the season total.</CardDescription>
      </CardHeader>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-[14px] text-ink-3">No squad player matches these filters.</p>
      ) : (
        <Table className="min-w-[560px] text-[13.5px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5 text-ink-3">Player</TableHead>
              {head('count', kind === 'bat' ? 'Runs' : 'Wickets')}
              {head('rate', kind === 'bat' ? 'Strike rate' : 'Economy')}
              {head('death', 'Death')}
              {head('pressure', 'Pressure')}
              {head('rv', 'Runs added', true)}
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
                      <span className="font-medium">{p.name}</span>
                      {p.overseas && <OverseasMark country={p.nat} size={13} />}
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
