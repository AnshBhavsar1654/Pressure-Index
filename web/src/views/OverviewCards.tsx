'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Meter, PlayerAvatar, RankRibbon, signed } from '@/components/kit'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Flag } from '@/components/Flag'
import { TeamBadge } from '@/components/TeamBadge'
import { Term } from '@/components/Term'
import { fmt } from '@/lib/format'

export type Lite = {
  id: number
  name: string
  rank: number
  team: string | null
  country: string | null
  p_rv100: number
  p_balls: number
  stay: number
  rate: number | null
}

/** The number one batter or bowler. */
export function Spotlight({ bat, bowl }: { bat: Lite; bowl: Lite }) {
  const [role, setRole] = useState<'bat' | 'bowl'>('bat')
  const p = role === 'bat' ? bat : bowl
  return (
    <section className="panel grid-hero relative flex h-full min-h-[340px] flex-col p-5" aria-label="Top rated player">
      <div className="flex items-start justify-between gap-3">
        <RankRibbon rank={1} />
        <ToggleGroup
          type="single"
          value={role}
          onValueChange={(v) => v && setRole(v as 'bat' | 'bowl')}
          className="rounded-lg border border-line bg-panel-2 p-1"
          aria-label="Choose batter or bowler"
        >
          <ToggleGroupItem value="bat" className="rounded-md px-3 text-ink-2 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
            Batter
          </ToggleGroupItem>
          <ToggleGroupItem value="bowl" className="rounded-md px-3 text-ink-2 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
            Bowler
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="mt-auto flex flex-col gap-4 pt-6">
        <div className="flex items-center gap-4">
          <PlayerAvatar name={p.name} highlight size={68} />
          <div className="min-w-0">
            <div className="display text-[1.85rem]">{p.name}</div>
            <div className="mt-1.5 flex items-center gap-2 text-[13.5px] text-ink-3">
              <TeamBadge team={p.team} size={24} />
              <Flag country={p.country} size={22} />
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-line bg-panel-2 px-3 py-2.5">
            <dt className="text-[12px] text-ink-3">{role === 'bat' ? 'Strike rate' : 'Economy'}</dt>
            <dd className="display num text-[1.5rem]">{role === 'bat' ? fmt.dec(p.rate, 0) : fmt.dec(p.rate, 2)}</dd>
          </div>
          <div className="rounded-lg border border-line bg-panel-2 px-3 py-2.5">
            <dt className="text-[12px] text-ink-3">
              <Term k="underPressure" role={role}>{role === 'bat' ? 'Runs added' : 'Runs saved'}</Term>
            </dt>
            <dd className="display num text-[1.5rem]">{signed(p.p_rv100)}</dd>
          </div>
          <div className="rounded-lg border border-line bg-panel-2 px-3 py-2.5">
            <dt className="text-[12px] text-ink-3">
              <Term k="confidence">Top-10 confidence</Term>
            </dt>
            <dd className="display num text-[1.5rem]">{fmt.pct(p.stay)}</dd>
          </div>
        </dl>
        <Link href={`/players/${role}/${p.id}/`} className="text-[13.5px] font-semibold text-signal-ink underline-offset-4 hover:underline">
          Open {p.name.split(' ').slice(-1)[0]}’s profile
        </Link>
      </div>
    </section>
  )
}

function Row({ p, role }: { p: Lite; role: 'bat' | 'bowl' }) {
  return (
    <li>
      <Link href={`/players/${role}/${p.id}/`} className="flex min-h-14 items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-panel-2">
        <span className={`num w-6 text-center text-[14px] font-semibold ${p.rank <= 3 ? 'text-signal-ink' : 'text-ink-3'}`}>{p.rank}</span>
        <PlayerAvatar name={p.name} size={38} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-medium">{p.name}</span>
        </span>
        <span className="flex items-center gap-2">
          <Flag country={p.country} size={20} />
          <TeamBadge team={p.team} size={26} />
        </span>
        <span className="flex w-16 flex-col items-end gap-1">
          <span className="num text-[13px] font-semibold">{fmt.pct(p.stay)}</span>
          <Meter value={p.stay} className="w-14" />
        </span>
      </Link>
    </li>
  )
}

/** Ranked list, batters and bowlers on tabs. */
export function TopTen({ bat, bowl }: { bat: Lite[]; bowl: Lite[] }) {
  return (
    <section className="panel flex h-full flex-col p-4" aria-label="Top 10 under pressure">
      <Tabs defaultValue="bat" className="flex h-full flex-col gap-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="display text-[1.3rem]">Top 10 under pressure</h2>
          <TabsList className="rounded-lg">
            <TabsTrigger value="bat" className="rounded-lg px-3">
              Batters
            </TabsTrigger>
            <TabsTrigger value="bowl" className="rounded-lg px-3">
              Bowlers
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="flex items-center justify-between px-2 text-[12px] text-ink-3">
          <span>Player</span>
          <Term k="confidence" />
        </div>
        {(['bat', 'bowl'] as const).map((role) => (
          <TabsContent key={role} value={role} className="mt-0">
            <ol className="flex flex-col">
              {(role === 'bat' ? bat : bowl).map((p) => (
                <Row key={p.id} p={p} role={role} />
              ))}
            </ol>
            <Link href={`/rankings/${role}/`} className="mt-2 block rounded-xl border border-line py-2.5 text-center text-[13.5px] font-semibold text-signal-ink hover:bg-panel-2">
              All {role === 'bat' ? 'batters' : 'bowlers'}
            </Link>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  )
}
