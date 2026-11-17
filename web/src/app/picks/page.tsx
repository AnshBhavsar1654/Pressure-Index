import type { Metadata } from 'next'
import Link from 'next/link'
import { Flag } from '@/components/Flag'
import { Note, PageHead, PlayerAvatar, SectionHead, Tag, ordinal, signed } from '@/components/kit'
import { TeamBadge } from '@/components/TeamBadge'
import { Term } from '@/components/Term'
import { getRole, getRR, getSummary } from '@/lib/data'
import { momentLine } from '@/views/Moments'
import { fmt, iplCode } from '@/lib/format'
import { betterThan, winPts } from '@/lib/terms'
import { rescore, type ComponentKey, type Gap, type Player, type Role } from '@/lib/types'

export const metadata: Metadata = { title: 'My picks' }

const PHASE_WORD: Record<string, string> = { Powerplay: 'powerplay', Middle: 'middle overs', Death: 'death' }
const SLOT: Record<string, string> = {
  bat_powerplay: 'opening batter',
  bat_middle: 'middle-order batter',
  bat_death: 'finisher',
  bowl_powerplay: 'new-ball bowler',
  bowl_middle: 'middle-overs bowler',
  bowl_death: 'death bowler',
}
const MIN_PHASE_BALLS = 30 // fewer pressure balls than this in a phase is too thin to call a strength

type Pick = { p: Player; z: Record<ComponentKey, number> }
const ON: Record<ComponentKey, string> = { pressure: 'output under pressure', recent: 'recent form', impact: 'win impact', delta: 'lifting above their normal', consistency: 'consistency' }

/** The qualified players RR can sign, best first, with each rating ingredient against the whole qualified pool. */
function picks(role: Role): Pick[] {
  const pool = getRole(role).players.filter((p) => p.merit_rank != null)
  return rescore(pool, getSummary().weights)
    .filter((p) => p.rank != null && p.rank <= 10)
    .toSorted((a, b) => a.rank! - b.rank!)
    .map((p) => ({ p, z: p.z }))
}

/** Two plain sentences on the player's strongest ingredients, then the evidence behind them. */
function why({ p, z }: Pick, role: Role): string[] {
  const noun = role === 'bat' ? 'batter' : 'bowler'
  const say: Record<ComponentKey, string> = {
    pressure:
      role === 'bat'
        ? `Scores ${fmt.dec(p.p_rv100, 1)} more runs per 100 pressure balls than an average batter would in the same situations.`
        : `Concedes ${fmt.dec(p.p_rv100, 1)} fewer runs per 100 pressure balls than an average bowler would in the same situations.`,
    consistency: `Delivered in ${Math.round(p.cons * 10)} of every 10 pressure ${role === 'bat' ? 'innings' : 'spells'}.`,
    recent: `Still doing it: ${signed(p.recent100)} runs ${role === 'bat' ? 'added' : 'saved'} per 100 pressure balls in 2025–26, over ${p.r_balls} balls in ${p.r_matches} matches.`,
    delta:
      p.delta100 >= 0
        ? `Gets ${fmt.dec(p.delta100, 0)} runs per 100 balls better than their own normal level when the match is tight.`
        : `Roughly at their normal level under pressure, which is already well above average.`,
    impact: `Adds ${Math.round(p.wpa100 * 100)} percentage points to the team’s chance of winning every 100 pressure balls.`,
  }
  const best = (Object.keys(z) as ComponentKey[]).toSorted((a, b) => z[b] - z[a]).slice(0, 2)
  return [
    ...best.map((k) => `${say[k]} Better than ${betterThan(z[k])}% of qualified ${noun}s on ${ON[k]}.`),
    `Backed by ${fmt.int(p.p_balls)} pressure balls in ${p.p_matches} matches, and top 10 in ${fmt.pct(p.boot?.p_top10)} of 400 re-runs.`,
    ...(p.moments[0]
      ? [`Biggest moment: ${momentLine(p.moments[0], role)} v ${p.moments[0].opp} (${fmt.date(p.moments[0].date)}), taking the team’s chance of winning from ${fmt.chance(p.moments[0].wp_from)} to ${fmt.chance(p.moments[0].wp_to)}${p.moments[0].won ? '' : ', though they lost'}.`]
      : []),
  ]
}

/** Where the player is strongest under pressure, and whether that is a phase where RR lost runs in 2026. */
function fit(p: Player, role: Role, gaps: Gap[], targets: Set<string>) {
  const phases = p.phases.filter((ph) => ph.balls >= MIN_PHASE_BALLS && ph.rv100 != null).toSorted((a, b) => b.rv100! - a.rv100!)
  if (!phases.length) return { fills: false, text: 'Not enough pressure balls in any one phase to name a best role yet.' }
  const best = phases[0]
  const key = `${role}_${best.phase.toLowerCase()}`
  const g = gaps.find((x) => x.key === key)!
  const lead = `At their best under pressure in the ${PHASE_WORD[best.phase]} (${best.balls} of their pressure balls came there).`
  if (targets.has(key)) {
    const how = g.gap_vs_avg < 0 ? `RR lost ${Math.abs(g.gap_vs_avg).toFixed(1)} runs a match there in 2026, ${ordinal(g.rank)} of 10` : `RR were ${Math.abs(g.gap_vs_top4).toFixed(1)} runs a match behind the top four there in 2026`
    return { fills: true, text: `${lead} ${how}, so they fill the ${SLOT[key]} role RR most need.` }
  }
  // strongest in a phase RR already handle well: look for a second strength in a phase RR need
  const other = phases.slice(1).find((ph) => targets.has(`${role}_${ph.phase.toLowerCase()}`) && ph.rv100! > 0)
  if (other) {
    const k2 = `${role}_${other.phase.toLowerCase()}`
    return { fills: true, text: `${lead} Also above average in the ${PHASE_WORD[other.phase]}, a phase RR need to fix, so they can cover the ${SLOT[k2]} role.` }
  }
  return { fills: false, text: `${lead} RR were already above average there in 2026 (${ordinal(g.rank)} of 10), so they would add depth rather than fix a gap.` }
}

function availability(p: Player, poolKnown: boolean) {
  if (!p.ipl_team) return 'No IPL squad since 2022: a fresh signing through the auction.'
  if (p.ipl_season !== 2026) return `Last IPL squad: ${p.ipl_team}, ${p.ipl_season}. In the auction.`
  return poolKnown ? `Released by ${p.ipl_team} after 2026, so in the auction.` : `In the ${p.ipl_team} squad in 2026.`
}

export default function PicksPage() {
  const rr = getRR()
  const targets = new Set(rr.recommendations.map((r) => r.gap.key))
  const lists = { bat: picks('bat'), bowl: picks('bowl') }
  const elig = getRole('bat').eligibility
  const fresh = (role: Role) =>
    getRole(role)
      .players.filter((p) => p.fresh_rank != null)
      .toSorted((a, b) => a.fresh_rank! - b.fresh_rank!)
      .slice(0, 8)

  return (
    <>
      <PageHead
        title="My picks"
        summary={
          <>
            The ten batters and ten bowlers RR could sign who deliver most reliably when the match is on the line, why I back each
            one and the gap they would fill, then the{' '}
            <a href="#fresh" className="font-semibold text-pink-ink hover:underline">
              fresh picks
            </a>{' '}
            among them who are new at the top level.
          </>
        }
      >
        <div className="max-w-sm">
          <Note title="Who is left out">
            RR’s own players are already in the squad, and Pakistani players cannot enter the IPL auction, so neither is listed
            here.{' '}
            {rr.pool.known
              ? 'Players retained by their teams are out too, so every name here can be bought at the auction.'
              : rr.pool.announced.length
                ? `Players retained by ${rr.pool.announced.map(iplCode).join(', ')} are out too and the next best moved up; the other teams follow as they announce.`
                : 'Once teams announce their retentions, retained players come out too and the next best move up.'}
          </Note>
        </div>
      </PageHead>

      <section className="panel grid gap-6 p-5 sm:p-6 md:grid-cols-2" aria-label="The twenty picks at a glance">
        {(['bat', 'bowl'] as const).map((role) => (
          <div key={role}>
            <h2 className="display mb-3 text-[1.6rem]">{role === 'bat' ? 'Batters' : 'Bowlers'} <span className="text-[13px] font-normal text-ink-3">in ranking order</span></h2>
            <ol className="grid gap-1.5">
              {lists[role].map(({ p }) => (
                <li key={p.id} className="flex items-center gap-3 text-[14.5px]">
                  <span className="display num w-6 text-right text-[1.3rem] text-pink">{p.rank}</span>
                  <a href={`#${role}-${p.id}`} className="font-medium hover:underline">
                    {p.name}
                  </a>
                  <Flag country={p.country} size={18} />
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>

      {(['bat', 'bowl'] as const).map((role) => {
        // auction priority: players who fix a 2026 weak spot first, then those who add depth; each group keeps ranking order
        const withFit = lists[role].map((pk) => ({ pk, f: fit(pk.p, role, rr.gaps, targets) }))
        const groups = [
          { key: 'fills', title: 'Fill a gap first', note: 'Strongest in a phase where RR lost runs in 2026.', items: withFit.filter((x) => x.f.fills) },
          { key: 'depth', title: 'Then add depth', note: 'Best in a phase RR already handle well.', items: withFit.filter((x) => !x.f.fills) },
        ].filter((g) => g.items.length)
        return (
        <div key={role}>
          <SectionHead title={role === 'bat' ? 'The ten batters' : 'The ten bowlers'}>
            Players who fix one of RR’s weak spots come first, then those who add depth. The big number is their pressure ranking.
            Hover any underlined term for what it means.
          </SectionHead>
          {groups.map((g) => (
          <div key={g.key} className="mb-6">
          <h3 className="mb-3 flex flex-wrap items-baseline gap-x-3 text-[15px] font-semibold">
            <Tag tone={g.key === 'fills' ? 'pink' : 'neutral'}>{g.items.length}</Tag> {g.title}
            <span className="text-[13px] font-normal text-ink-3">{g.note}</span>
          </h3>
          <div className="grid gap-4 xl:grid-cols-2">
            {g.items.map(({ pk, f }) => {
              const { p } = pk
              return (
                <article key={p.id} id={`${role}-${p.id}`} className="panel flex scroll-mt-24 flex-col gap-4 p-5">
                  <header className="flex items-start gap-4">
                    <span className="display num text-[2.6rem] leading-none text-pink">{p.rank}</span>
                    <PlayerAvatar name={p.name} size={46} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/players/${role}/${p.id}/`} className="display text-[1.7rem] hover:underline">
                        {p.name}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
                        <Flag country={p.country} size={18} />
                        <span>{p.country}</span>
                        {p.ipl_team && <TeamBadge team={p.ipl_team} size={20} />}
                        <span>{role === 'bat' ? (p.hand === 'LHB' ? 'Left-handed' : 'Right-handed') : p.bowl_type}</span>
                      </div>
                    </div>
                  </header>

                  <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      [<Term key="u" k="underPressure" role={role} />, signed(p.p_rv100)],
                      [<Term key="c" k="consistency" role={role} />, fmt.pct(p.cons)],
                      [<Term key="w" k="winImpact" />, winPts(p.wpa100)],
                      [<Term key="t" k="confidence" />, fmt.pct(p.boot?.p_top10)],
                    ].map(([k, v], i) => (
                      <div key={i} className="rounded-lg bg-panel-2 px-3 py-2">
                        <dt className="text-[12px] text-ink-3">{k}</dt>
                        <dd className="display num text-[1.5rem]">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="text-[13px] text-ink-3">
                    {role === 'bat'
                      ? `Strike rate ${fmt.dec(p.press.sr, 0)} under pressure, ${fmt.dec(p.norm.sr, 0)} normally.`
                      : `Economy ${fmt.dec(p.press.econ, 2)} under pressure, ${fmt.dec(p.norm.econ, 2)} normally.`}
                  </p>

                  <div>
                    <h3 className="mb-1.5 text-[13.5px] font-semibold">Why I back them</h3>
                    <ul className="flex flex-col gap-1.5 pl-4 text-[13.5px] leading-relaxed text-ink-2 marker:text-pink" style={{ listStyle: 'disc' }}>
                      {why(pk, role).map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                  <div className={f.fills ? 'rounded-lg border border-pink/30 bg-pink-soft/50 p-3' : 'rounded-lg border border-line bg-panel-2/60 p-3'}>
                    <h3 className="mb-1 flex items-center gap-2 text-[13.5px] font-semibold">
                      How they help RR <Tag tone={f.fills ? 'pink' : 'neutral'}>{f.fills ? 'Fills a gap' : 'Adds depth'}</Tag>
                    </h3>
                    <p className="text-[13.5px] leading-relaxed text-ink-2">{f.text}</p>
                  </div>
                  <p className="text-[12.5px] text-ink-3">{availability(p, rr.pool.known)}</p>
                </article>
              )
            })}
          </div>
          </div>
          ))}
        </div>
        )
      })}

      <SectionHead id="fresh" title="Fresh picks: new at the top level">
        Players whose first IPL or T20I match in the data is {elig.fresh_from} or later, the kind of find an auction can be won on. The
        data starts in 2022 and holds no ages, so a few (George Linde, for one) are new to this level rather than young. They are ranked on exactly
        the same scale as the top 10; this list just pulls the newcomers out. Shorter records, so treat them as scouting leads rather
        than sure things.
      </SectionHead>
      <div className="mb-10 grid gap-4 xl:grid-cols-2">
        {(['bat', 'bowl'] as const).map((role) => (
          <section key={role} className="panel overflow-hidden">
            <h3 className="border-b border-line px-5 py-3 text-[15px] font-semibold">{role === 'bat' ? 'Batters' : 'Bowlers'}</h3>
            <ol className="divide-y divide-line">
              {fresh(role).map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-2.5 text-[13.5px]">
                  <span className="display num w-5 text-right text-[1.2rem] text-pink">{p.fresh_rank}</span>
                  <PlayerAvatar name={p.name} size={30} />
                  <span className="min-w-0 flex-1">
                    <Link href={`/players/${role}/${p.id}/`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <span className="block text-[12px] text-ink-3">
                      {p.country ?? 'Uncapped'} · first seen {p.debut} · {p.p_balls} pressure balls
                      {p.ipl_team ? ` · last IPL squad ${iplCode(p.ipl_team)}` : ''}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="num block font-semibold">{signed(p.p_rv100)}</span>
                    <span className="block text-[11.5px] text-ink-3">recent {signed(p.recent100)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

    </>
  )
}
