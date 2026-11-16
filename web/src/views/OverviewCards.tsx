'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Meter, PlayerAvatar, RankRibbon, signed } from '@/components/kit'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Flag } from '@/components/Flag'
import { TeamBadge } from '@/components/TeamBadge'
import { fmt } from '@/lib/format'

export type Lite = {
  id: number
  name: string
  rank: number
  team: string | null
  country: string | null
  rr: boolean
  p_rv100: number
  p_balls: number
  stay: number
  rate: number | null
  rateNormal: number | null
  extra: string
}

/** The number one batter or bowler, as a team-sheet card. */
export function Spotlight({ bat, bowl }: { bat: Lite; bowl: Lite }) {
  const [role, setRole] = useState<'bat' | 'bowl'>('bat')
  const p = role === 'bat' ? bat : bowl
  return (
    <section className="panel jersey jersey-royal relative flex h-full min-h-[340px] flex-col p-5" aria-label="Top rated player">
      <div className="flex items-start justify-between gap-3">
        <RankRibbon rank={1} className="-mt-5" />
        <ToggleGroup
          type="single"
          value={role}
          onValueChange={(v) => v && setRole(v as 'bat' | 'bowl')}
          className="rounded-lg bg-black/25 p-1"
          aria-label="Choose batter or bowler"
        >
          <ToggleGroupItem value="bat" className="rounded-lg px-3 text-white/80 data-[state=on]:bg-white data-[state=on]:text-royal">
            Batter
          </ToggleGroupItem>
          <ToggleGroupItem value="bowl" className="rounded-lg px-3 text-white/80 data-[state=on]:bg-white data-[state=on]:text-royal">
            Bowler
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="mt-auto flex flex-col gap-4 pt-6">
        <div className="flex items-center gap-4">
          <PlayerAvatar name={p.name} rr size={68} className="bg-white/85" />
          <div className="min-w-0">
            <div className="display text-[2rem] text-white">{p.name}</div>
            <div className="mt-1 flex items-center gap-2 text-[13.5px] text-white/75">
              <TeamBadge team={p.team} size={24} />
              <Flag country={p.country} size={22} />
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-black/25 px-3 py-2.5">
            <dt className="text-[12px] text-white/70">{role === 'bat' ? 'Strike rate' : 'Economy'}</dt>
            <dd className="display num text-[1.7rem] text-white">{role === 'bat' ? fmt.dec(p.rate, 0) : fmt.dec(p.rate, 2)}</dd>
          </div>
          <div className="rounded-xl bg-black/25 px-3 py-2.5">
            <dt className="text-[12px] text-white/70">Runs added</dt>
            <dd className="display num text-[1.7rem] text-white">{signed(p.p_rv100)}</dd>
          </div>
          <div className="rounded-xl bg-black/25 px-3 py-2.5">
            <dt className="text-[12px] text-white/70">Stays top 10</dt>
            <dd className="display num text-[1.7rem] text-white">{fmt.pct(p.stay)}</dd>
          </div>
        </dl>
        <Link href={`/players/${role}/${p.id}/`} className="text-[13.5px] font-semibold text-white underline-offset-4 hover:underline">
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
        <span className={`display num w-6 text-center text-[1.3rem] ${p.rank <= 3 ? 'text-pink' : 'text-ink-3'}`}>{p.rank}</span>
        <PlayerAvatar name={p.name} rr={p.rr} size={38} />
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

/** Ranked list styled after a team roster, batters and bowlers on tabs. */
export function TopTen({ bat, bowl }: { bat: Lite[]; bowl: Lite[] }) {
  return (
    <section className="panel flex h-full flex-col p-4" aria-label="Top 10 under pressure">
      <Tabs defaultValue="bat" className="flex h-full flex-col gap-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="display text-[1.5rem]">Top 10</h2>
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
          <span>Stays top 10</span>
        </div>
        {(['bat', 'bowl'] as const).map((role) => (
          <TabsContent key={role} value={role} className="mt-0">
            <ol className="flex flex-col">
              {(role === 'bat' ? bat : bowl).map((p) => (
                <Row key={p.id} p={p} role={role} />
              ))}
            </ol>
            <Link href={`/rankings/${role}/`} className="mt-2 block rounded-xl border border-line py-2.5 text-center text-[13.5px] font-semibold text-pink-ink hover:bg-panel-2">
              All {role === 'bat' ? 'batters' : 'bowlers'}
            </Link>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  )
}
