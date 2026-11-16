'use client'

import { CrownIcon } from '@phosphor-icons/react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { NAT_OPTIONS, natMatch, Segmented, type Nat } from '@/components/filters'
import { Meter, OverseasMark, PlayerAvatar, signed, Tag } from '@/components/kit'
import { Slider } from '@/components/ui/slider'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Flag } from '@/components/Flag'
import { TeamBadge } from '@/components/TeamBadge'
import type { Candidate } from '@/lib/types'
import { Term } from '@/components/Term'
import { cn } from '@/lib/utils'

type Exp = 'any' | 'ipl'

/** Ranked candidates for one role, filterable by nationality and IPL experience. */
export function CandidateTable({
  candidates,
  isBat,
  phase,
  defaultMin,
  poolKnown,
}: {
  candidates: Candidate[]
  isBat: boolean
  phase: string
  defaultMin: number
  /** true once the official released list is loaded; until then availability is an estimate */
  poolKnown: boolean
}) {
  const [nat, setNat] = useState<Nat>('all')
  const [exp, setExp] = useState<Exp>('any')
  const [minBalls, setMinBalls] = useState(defaultMin)
  const [show, setShow] = useState<'10' | '20' | '40'>('10')
  const [avail, setAvail] = useState<'likely' | 'all'>('likely')
  const [keep, setKeep] = useState(6)
  // until the retention list is out, assume each franchise keeps the N players who added the most runs for it
  const retained = (c: Candidate) => !poolKnown && c.core_rank != null && c.core_rank <= keep
  const floor = Math.min(...candidates.map((c) => c.balls))
  const maxFit = Math.max(...candidates.map((c) => c.fit))
  const minFit = Math.min(...candidates.map((c) => c.fit))
  // candidates arrive best fit first; filters keep that order and the top three get the crown
  const matching = useMemo(
    () => candidates.filter((c) => c.balls >= minBalls && natMatch(nat, c.nat, c.overseas) && (exp === 'any' || c.ipl_balls > 0) && (avail === 'all' || !retained(c))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidates, nat, exp, minBalls, avail, keep, poolKnown],
  )
  const rows = matching.slice(0, Number(show)).map((c, i) => ({ c, pick: i < 3, n: i + 1 }))
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 px-5 py-3">
        {!poolKnown && (
          <Segmented
            label="Availability"
            value={avail}
            onChange={setAvail}
            options={[
              { value: 'likely', label: 'Likely available' },
              { value: 'all', label: 'Everyone' },
            ]}
          />
        )}
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
        <div className="flex min-w-60 flex-1 items-center gap-3 rounded-lg border border-line bg-panel-2 px-3 py-1.5 sm:max-w-xs">
          <span id={`mb-${phase}`} className="shrink-0 text-[12.5px] text-ink-2">
            Min balls in role
          </span>
          <Slider aria-labelledby={`mb-${phase}`} min={Math.max(30, floor)} max={300} step={10} value={[minBalls]} onValueChange={([v]) => setMinBalls(v)} />
          <span className="display num w-9 text-right text-[1.3rem] text-pink">{minBalls}</span>
        </div>
        {!poolKnown && avail === 'likely' && (
          <div className="flex min-w-60 flex-1 items-center gap-3 rounded-lg border border-line bg-panel-2 px-3 py-1.5 sm:max-w-xs" title="Estimate: each franchise keeps its players who added the most runs in 2026. Replaced by the official list when it is published.">
            <span id={`keep-${phase}`} className="shrink-0 text-[12.5px] text-ink-2">
              Each team keeps top
            </span>
            <Slider aria-labelledby={`keep-${phase}`} min={0} max={12} step={1} value={[keep]} onValueChange={([v]) => setKeep(v)} />
            <span className="display num w-9 text-right text-[1.3rem] text-pink">{keep}</span>
          </div>
        )}
        <Segmented
          label="How many to show"
          value={show}
          onChange={setShow}
          options={[
            { value: '10', label: 'Top 10' },
            { value: '20', label: 'Top 20' },
            { value: '40', label: 'Top 40' },
          ]}
        />
        <span className="ml-auto text-[12.5px] text-ink-3">
          {rows.length} of {matching.length} matching
          {minBalls !== defaultMin && (
            <button className="ml-2 font-semibold text-pink-ink hover:underline" onClick={() => setMinBalls(defaultMin)}>
              Reset to {defaultMin}
            </button>
          )}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="border-t px-5 py-8 text-center text-[14px] text-ink-3">No candidate matches these filters. Try “All” or “Any”.</p>
      ) : (
        <Table className="min-w-[780px] border-t text-[13.5px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10 pl-5 text-ink-3">#</TableHead>
              <TableHead className="text-ink-3">Player</TableHead>
              <TableHead className="text-ink-3" title="Team in the IPL 2026 squad lists; empty means no IPL 2026 squad">2026 team</TableHead>
              <TableHead className="text-right text-ink-3">
                <span title={`Runs ${isBat ? 'added' : 'saved'} per 100 balls in the ${phase === 'Middle' ? 'middle overs' : phase.toLowerCase()} (all balls, not only pressure), against an average player. Small samples are pulled towards 0.`} className="cursor-help underline decoration-dotted underline-offset-[3px]">
                  In this role
                </span>
              </TableHead>
              <TableHead className="text-right text-ink-3">{isBat ? 'Strike rate' : 'Economy'}</TableHead>
              <TableHead className="text-right text-ink-3">Balls</TableHead>
              <TableHead className="text-right text-ink-3">
                <span title="Place in my pressure ranking. 'Not ranked' means fewer than 120 pressure balls, not a bad record." className="cursor-help underline decoration-dotted underline-offset-[3px]">
                  Pressure ranking
                </span>
              </TableHead>
              <TableHead className="pr-5 text-ink-3">
                <Term k="roleFit" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ c, pick, n }) => {
              const href = c.press_rank != null ? `/players/${isBat ? 'bat' : 'bowl'}/${c.id}/` : null
              return (
                <TableRow key={c.id} className={cn(pick && 'bg-gold-soft/40 hover:bg-gold-soft/60')}>
                  <TableCell className="num pl-5 text-ink-3">{n}</TableCell>
                  <TableCell className="py-2.5">
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
                          <Flag country={c.nat} size={21} />
                          {c.overseas && <OverseasMark country={c.nat} size={12} />}
                          {c.ipl_balls === 0 && <Tag>No IPL games since 2024</Tag>}
                          {retained(c) && <Tag tone="blue">Likely retained (estimate)</Tag>}
                          {c.balls < defaultMin && <Tag>Small sample</Tag>}
                        </span>
                        <span className="max-w-[34ch] text-[12px] leading-snug text-ink-3">
                          {signed(c.rv100)} runs {isBat ? 'added' : 'saved'} per 100 {phase === 'Middle' ? 'middle-overs' : phase.toLowerCase()} balls over {c.balls}
                          {c.press_rank != null ? `, ranked ${c.press_rank} under pressure` : ', not in the pressure ranking'}
                        </span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="text-ink-2">{c.ipl_team_2026 ? <TeamBadge team={c.ipl_team_2026} size={28} /> : '–'}</TableCell>
                  <TableCell className={cn('num text-right font-semibold', c.rv100 >= 0 ? 'text-pink-ink' : 'text-blue')}>{signed(c.rv100)}</TableCell>
                  <TableCell className="num text-right">{isBat ? c.sr : c.econ}</TableCell>
                  <TableCell className="num text-right text-ink-2">{c.balls}</TableCell>
                  <TableCell className="num text-right text-ink-2">{c.press_rank ?? 'not ranked'}</TableCell>
                  <TableCell className="pr-5">
                    <Meter value={(c.fit - minFit) / (maxFit - minFit || 1)} tone={pick ? 'gold' : 'blue'} className="w-20" />
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
