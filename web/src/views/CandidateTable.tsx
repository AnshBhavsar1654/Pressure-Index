'use client'

import { CrownIcon } from '@phosphor-icons/react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { NAT_OPTIONS, natMatch, Segmented, type Nat } from '@/components/filters'
import { Meter, PlayerAvatar, signed, Tag } from '@/components/kit'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { iplCode } from '@/lib/format'
import type { Candidate } from '@/lib/types'
import { cn } from '@/lib/utils'

type Exp = 'any' | 'ipl'

/** Ranked candidates for one role, filterable by nationality and IPL experience. */
export function CandidateTable({ candidates, isBat, phase }: { candidates: Candidate[]; isBat: boolean; phase: string }) {
  const [nat, setNat] = useState<Nat>('all')
  const [exp, setExp] = useState<Exp>('any')
  const maxFit = Math.max(...candidates.map((c) => c.fit))
  const rows = useMemo(
    () => candidates.map((c, i) => ({ c, pick: i < 3 })).filter(({ c }) => natMatch(nat, c.nat, c.overseas) && (exp === 'any' || c.ipl_balls > 0)),
    [candidates, nat, exp],
  )
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 px-5 py-3">
        <Segmented label="Nationality" value={nat} onChange={setNat} options={NAT_OPTIONS} />
        <Segmented
          label="IPL experience"
          value={exp}
          onChange={setExp}
          options={[
            { value: 'any', label: 'Any' },
            { value: 'ipl', label: 'Played IPL since 2024' },
          ]}
        />
        <span className="ml-auto text-[12.5px] text-ink-3">
          {rows.length} of {candidates.length} shown
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="border-t px-5 py-8 text-center text-[14px] text-ink-3">No candidate matches these filters. Try “All” or “Any”.</p>
      ) : (
        <Table className="min-w-[780px] border-t text-[13.5px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5 text-ink-3">Player</TableHead>
              <TableHead className="text-ink-3">2026 team</TableHead>
              <TableHead className="text-right text-ink-3" title={`Runs added per 100 balls in the ${phase.toLowerCase()}`}>
                In this role
              </TableHead>
              <TableHead className="text-right text-ink-3">{isBat ? 'Strike rate' : 'Economy'}</TableHead>
              <TableHead className="text-right text-ink-3">Balls</TableHead>
              <TableHead className="text-right text-ink-3">Pressure rank</TableHead>
              <TableHead className="pr-5 text-ink-3">Fit score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ c, pick }) => {
              const href = c.press_rank != null ? `/players/${isBat ? 'bat' : 'bowl'}/${c.id}/` : null
              return (
                <TableRow key={c.id} className={cn(pick && 'bg-gold-soft/40 hover:bg-gold-soft/60')}>
                  <TableCell className="py-2.5 pl-5">
                    <span className="flex items-center gap-3">
                      <PlayerAvatar name={c.name} size={34} />
                      <span className="flex flex-col gap-1">
                        <span className="flex items-center gap-1.5">
                          {pick && <CrownIcon weight="fill" className="text-gold" aria-label="top pick" />}
                          {href ? (
                            <Link href={href} className="font-medium hover:underline">
                              {c.name}
                            </Link>
                          ) : (
                            <span className="font-medium">{c.name}</span>
                          )}
                        </span>
                        <span className="flex flex-wrap gap-1">
                          <Tag tone={c.overseas ? 'blue' : 'neutral'}>{c.overseas ? `Overseas, ${c.nat}` : c.nat}</Tag>
                          {c.ipl_balls === 0 && <Tag>No IPL games since 2024</Tag>}
                        </span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="text-ink-2">{c.ipl_team_2026 ? iplCode(c.ipl_team_2026) : '–'}</TableCell>
                  <TableCell className={cn('num text-right font-semibold', c.rv100 >= 0 ? 'text-pink-ink' : 'text-blue')}>{signed(c.rv100)}</TableCell>
                  <TableCell className="num text-right">{isBat ? c.sr : c.econ}</TableCell>
                  <TableCell className="num text-right text-ink-2">{c.balls}</TableCell>
                  <TableCell className="num text-right text-ink-2">{c.press_rank ?? 'not ranked'}</TableCell>
                  <TableCell className="pr-5">
                    <span className="flex items-center gap-2">
                      <Meter value={c.fit / maxFit} tone={pick ? 'gold' : 'blue'} className="w-14" />
                      <span className="num text-[12.5px] text-ink-3">{c.fit.toFixed(2)}</span>
                    </span>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
