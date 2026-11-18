import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { Flag } from '@/components/Flag'
import { Bullets, Note, OverseasMark, PageHead, PlayerAvatar, SectionHead, Tag, ordinal, signed } from '@/components/kit'
import { TeamBadge } from '@/components/TeamBadge'
import { EmergingTag, Term } from '@/components/Term'
import { getRole, getRR } from '@/lib/data'
import { momentLine } from '@/views/Moments'
import { fmt } from '@/lib/format'
import { winPts } from '@/lib/terms'
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

type Pick = { p: Player; z: Record<ComponentKey, number>; beats: Record<ComponentKey, number> }

/** The recommended players, best first, with each piece of evidence against the whole qualified pool. */
function picks(role: Role): Pick[] {
  const pool = getRole(role).players.filter((p) => p.merit_rank != null)
  return rescore(pool)
    .filter((p) => p.rank != null && p.rank <= 10)
    .toSorted((a, b) => a.rank! - b.rank!)
    .map((p) => ({ p, z: p.z, beats: p.beats }))
}

/** One line of evidence: how much there is, and the raw rate against what an average player would do on the same balls. */
function evidence(p: Player, role: Role) {
  const rate =
    role === 'bat'
      ? `strike rate ${fmt.dec(p.press.sr, 0)} vs ${fmt.dec(p.press.par_sr, 0)} for an average batter`
      : `economy ${fmt.dec(p.press.econ, 2)} vs ${fmt.dec(p.press.par_econ, 2)} for an average bowler`
  return `${fmt.int(p.p_balls)} pressure balls in ${p.p_matches} matches · ${rate}`
}

/** The biggest pressure moment, in one short line. */
function moment(p: Player, role: Role) {
  const m = p.moments[0]
  if (!m) return null
  return `${momentLine(m, role)} v ${m.opp}, ${fmt.date(m.date)} (${fmt.chance(m.wp_from)} → ${fmt.chance(m.wp_to)}${m.won ? '' : ', lost'})`
}

/** Where the player is strongest under pressure, and whether that fixes a phase where RR lost runs in 2026: one short line. */
function fit(p: Player, role: Role, gaps: Gap[], targets: Set<string>, minBalls = MIN_PHASE_BALLS) {
  const phases = p.phases.filter((ph) => ph.balls >= minBalls && ph.rv100 != null).toSorted((a, b) => b.rv100! - a.rv100!)
  if (!phases.length) return { fills: false, text: 'Too few pressure balls in any one phase to name a role yet' }
  const key = `${role}_${phases[0].phase.toLowerCase()}`
  const g = gaps.find((x) => x.key === key)!
  const cap = (x: string) => x[0].toUpperCase() + x.slice(1)
  if (targets.has(key)) return { fills: true, text: `${cap(SLOT[key])}: RR were ${ordinal(g.rank)} of 10 there in 2026` }
  // strongest where RR are already fine: a second strength in a phase RR need still fills a gap
  const other = phases.slice(1).find((ph) => targets.has(`${role}_${ph.phase.toLowerCase()}`) && ph.rv100! > 0)
  if (other) {
    const k2 = `${role}_${other.phase.toLowerCase()}`
    return { fills: true, text: `Can cover ${SLOT[k2]} (best in the ${PHASE_WORD[phases[0].phase]})` }
  }
  return { fills: false, text: `${cap(SLOT[key])}: RR were already ${ordinal(g.rank)} of 10 there` }
}

// Emerging picks: a lighter evidence bar than the top 10, because a young player has had less time to build a
// pressure record. Half the main bar's balls and recent balls, the same no-dip rule, and the same auction rules.
const EMERGING_MIN_BALLS = 25
const EMERGING_MIN_MATCHES = 2
const EMERGING_MIN_RECENT = 10
const EMERGING_PER_ROLE = 5
const SHORT_TERM_AGE = 35 // 35 or older during the 2027 season: a one- or two-season buy

/** Age during the 2027 season: exact on 1 April 2027 when the full birth date is known, otherwise the age he turns in 2027. */
function age2027(born: string | null) {
  if (!born) return null
  if (born.length === 4) return 2027 - Number(born)
  const [y, m, d] = born.split('-').map(Number)
  return 2027 - y - (m > 4 || (m === 4 && d > 1) ? 1 : 0)
}

/** Signable players under 26 outside both top 10s who clear the lighter bar and do not dip, best rating first. */
function emergingPicks(role: Role, top: Set<number>): Player[] {
  return getRole(role)
    .players.filter(
      (p) =>
        p.emerging &&
        !top.has(p.id) &&
        (p.excluded == null || p.excluded === 'dips') &&
        p.delta100 >= 0 &&
        p.p_eff >= EMERGING_MIN_BALLS &&
        p.p_matches >= EMERGING_MIN_MATCHES &&
        p.r_eff >= EMERGING_MIN_RECENT,
    )
    .toSorted((a, b) => b.p_rv100 - a.p_rv100)
    .slice(0, EMERGING_PER_ROLE)
}

// Indian options: retentions took almost every above-average Indian, so the top 10 holds few. These are the
// signable Indians in an IPL 2026 squad who clear the Indian evidence bar without its 2025-26 rule (17 pressure balls
// in 2 matches), do not dip, and rate about average or better (within 1 run per 100 balls of average), listed in
// the role they mainly play. Options to weigh, not top-10 picks: none is clearly above average yet.
const INDIAN_OPTION_FLOOR = -1

function indianOptions(top: Set<number>) {
  const bat = new Map(getRole('bat').players.map((p) => [p.id, p]))
  const bowl = new Map(getRole('bowl').players.map((p) => [p.id, p]))
  const total = (p?: Player) => (p ? p.p_balls + p.n_balls : 0)
  const [minBalls, minMatches] = getRole('bat').eligibility.indian_min
  return (['bat', 'bowl'] as const)
    .flatMap((role) =>
      [...(role === 'bat' ? bat : bowl).values()]
        .filter(
          (p) =>
            p.indian &&
            p.excluded == null &&
            !top.has(p.id) &&
            p.ipl_season === 2026 &&
            p.delta100 >= 0 &&
            p.p_rv100 >= INDIAN_OPTION_FLOOR &&
            p.p_eff >= minBalls &&
            p.p_matches >= minMatches &&
            total(p) >= total((role === 'bat' ? bowl : bat).get(p.id)),
        )
        .map((p) => ({ p, role })),
    )
    .toSorted((a, b) => b.p.p_rv100 - a.p.p_rv100)
}

/** How many qualified Indians who are above average and do not dip were already kept by a franchise. */
function indianSupply() {
  return (['bat', 'bowl'] as const).map((role) => {
    const good = getRole(role).players.filter((p) => p.indian && p.merit_rank != null && p.p_rv100 > 0 && p.delta100 >= 0)
    return { role, total: good.length, kept: good.filter((p) => p.excluded === 'retained' || p.excluded === 'rr').length }
  })
}

/** Young names RR could buy, with enough pressure balls to judge, who get worse when it matters. */
function tippedButDip(top: Set<number>) {
  const seen = new Set<number>()
  return (['bat', 'bowl'] as const)
    .flatMap((role) =>
      getRole(role)
        .players.filter((p) => p.emerging && !top.has(p.id) && (p.excluded == null || p.excluded === 'dips') && p.delta100 < 0 && p.p_balls >= 50)
        .map((p) => ({ p, role })),
    )
    .toSorted((a, b) => b.p.p_balls - a.p.p_balls)
    .filter(({ p }) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .slice(0, 8)
}

/** Why RR should buy him, in one or two plain sentences built from the evidence. */
type Kind = 'top' | 'emerging' | 'indian'

function whyLine(p: Player, role: Role, kind: Kind) {
  const runs = role === 'bat' ? 'runs' : 'runs saved'
  const age = age2027(p.born)
  const lift =
    p.delta100 >= 3
      ? `gets better when it matters (${signed(p.delta100)} ${runs} per 100 balls above his usual level)`
      : 'holds his usual level when it matters'
  const recent =
    p.r_balls >= 20 && p.recent100 > 0
      ? `, and is still doing it: ${signed(p.recent100)} in 2025–26 alone`
      : p.r_balls >= 20
        ? `; 2025–26 alone is ${signed(p.recent100)}, so watch his form`
        : ''
  if (kind === 'indian') {
    const level = p.p_rv100 > 0 ? `Above average under pressure (${signed(p.p_rv100)})` : `About average under pressure (${signed(p.p_rv100)})`
    const seen = p.r_balls > 0 ? `${p.r_balls} pressure balls in 2025–26` : 'Not seen under pressure in 2025–26, so check current form'
    const boot = p.boot && p.boot.p_top10 >= 0.3 ? ` Top 10 in ${fmt.pct(p.boot.p_top10)} of re-runs.` : ''
    return `${level}, and ${lift}. ${seen}. An Indian option for a squad short of overseas places.${boot}`
  }
  if (kind === 'emerging') {
    const level =
      p.p_rv100 > 0
        ? `Already above average under pressure (${signed(p.p_rv100)}).`
        : `Not yet above average overall (${signed(p.p_rv100)}), so a squad and development buy, not a starter yet.`
    const noc = p.country === 'Bangladesh' ? ' The Bangladesh board often limits IPL release, so check his availability.' : ''
    return `${age ? `${age} during IPL 2027 and ` : ''}${lift}${recent}. ${level}${noc}`
  }
  const conf = p.boot ? (p.boot.p_top10 >= 0.5 ? ' A safe pick: ' : ' A close call: ') + `top 10 in ${fmt.pct(p.boot.p_top10)} of re-runs.` : ''
  return `${lift[0].toUpperCase()}${lift.slice(1)}${recent}.${conf}`
}

function PickCard({
  p,
  role,
  badge,
  f,
  kind = 'top',
}: {
  p: Player
  role: Role
  badge: string | number
  f: { fills: boolean; text: string }
  kind?: Kind
}) {
  const age = age2027(p.born)
  const shortTerm = age != null && age >= SHORT_TERM_AGE
  const stats: [ReactNode, string][] = [
    [<Term key="u" k="underPressure" role={role} />, signed(p.p_rv100)],
    [<Term key="l" k="lift" />, signed(p.delta100)],
    [<Term key="w" k="winImpact" />, winPts(p.wpa100)],
    kind === 'top' ? [<Term key="t" k="confidence" />, fmt.pct(p.boot?.p_top10)] : [<Term key="r" k="recentForm" />, p.r_balls ? signed(p.recent100) : '–'],
  ]
  return (
    <article id={`${kind === 'top' ? role : kind === 'emerging' ? 'em' : 'in'}-${p.id}`} className="panel flex scroll-mt-24 flex-col gap-4 p-5">
      <header className="flex items-start gap-4">
        <span className={`display num text-[2.6rem] leading-none ${kind === 'top' ? 'text-pink' : kind === 'emerging' ? 'text-gold' : 'text-blue'}`}>{badge}</span>
        <PlayerAvatar name={p.name} size={46} />
        <div className="min-w-0 flex-1">
          <Link href={`/players/${role}/${p.id}/`} className="display text-[1.7rem] hover:underline">
            {p.name}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
            <Flag country={p.country} size={18} />
            <span>{p.country ?? 'India'}</span>
            {p.ipl_team && <TeamBadge team={p.ipl_team} size={20} />}
            <span>{role === 'bat' ? (p.hand === 'LHB' ? 'Left-handed' : 'Right-handed') : p.bowl_type}</span>
            {age != null && <span>age {age} in 2027</span>}
            {p.emerging && <EmergingTag />}
            {shortTerm && <Tag tone="neutral">Short-term buy</Tag>}
          </div>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map(([k, v], i) => (
          <div key={i} className="rounded-lg bg-panel-2 px-3 py-2">
            <dt className="text-[12px] text-ink-3">{k}</dt>
            <dd className="display num text-[1.5rem]">{v}</dd>
          </div>
        ))}
      </dl>
      <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13.5px] leading-snug">
        <dt className="text-ink-3">Why RR</dt>
        <dd className="text-ink">{whyLine(p, role, kind)}</dd>
        <dt className="text-ink-3">Evidence</dt>
        <dd className="text-ink-2">{evidence(p, role)}</dd>
        {moment(p, role) && (
          <>
            <dt className="text-ink-3">Best moment</dt>
            <dd className="text-ink-2">{moment(p, role)}</dd>
          </>
        )}
        <dt className="text-ink-3">Role at RR</dt>
        <dd className="flex flex-wrap items-center gap-2 text-ink-2">
          <Tag tone={f.fills ? 'pink' : 'neutral'}>{f.fills ? 'Fills a gap' : 'Adds depth'}</Tag>
          <span>{f.text}</span>
        </dd>
      </dl>
    </article>
  )
}

export default function PicksPage() {
  const rr = getRR()
  const targets = new Set(rr.recommendations.map((r) => r.gap.key))
  const lists = { bat: picks('bat'), bowl: picks('bowl') }
  const elig = getRole('bat').eligibility
  const top = new Set([...lists.bat, ...lists.bowl].map(({ p }) => p.id))
  const emergingIn = (role: Role) => lists[role].filter(({ p }) => p.emerging).map(({ p }) => p)
  const em = { bat: emergingPicks('bat', top), bowl: emergingPicks('bowl', top) }
  const dips = tippedButDip(top)
  const ind = indianOptions(top)
  const supply = indianSupply()
  const names = (ps: Player[]) => new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(ps.map((p) => p.name))
  const veterans = [...lists.bat, ...lists.bowl].filter(({ p }) => (age2027(p.born) ?? 0) >= SHORT_TERM_AGE).map(({ p }) => p)

  return (
    <>
      <PageHead
        title="My picks"
        summary={
          <>
            The 10 batters and 10 bowlers RR can sign who deliver most reliably under pressure, plus{' '}
            <a href="#emerging" className="font-semibold text-pink-ink hover:underline">
              emerging players
            </a>{' '}
            and{' '}
            <a href="#indian" className="font-semibold text-pink-ink hover:underline">
              Indian options
            </a>{' '}
            to buy alongside them.
          </>
        }
      >
        <div className="max-w-sm">
          <Note title="Who makes the list">
            <ul className="mt-1 flex flex-col gap-1.5 pl-4 marker:text-pink" style={{ listStyle: 'disc' }}>
              <li>
                <b>Not in the auction:</b> RR’s own squad,{' '}
                {rr.pool.known || rr.pool.announced.length ? 'players retained by other teams, ' : ''}retired or banned players
                (Harry Brook can’t play in 2027) and Pakistani players.
              </li>
              <li>
                <b>Not recommended:</b> anyone worse under pressure than usual.
              </li>
              <li>
                <b>Indian players:</b> each one above average under pressure gets a place
                {rr.slots ? `, because RR have only ${rr.slots.open_overseas} overseas places left` : ''}. Retentions took most of
                them, so {ind.length} more are listed as Indian options.
              </li>
              <li>
                <b>Bangladeshi players:</b> at most one per list, because their board often limits IPL release.
              </li>
              <li>
                <b>Proven and emerging:</b> {emergingIn('bat').length + emergingIn('bowl').length} of the 20 are under 26 for 2027 on
                merit; the emerging picks below add {em.bat.length + em.bowl.length} more on a lighter bar.
              </li>
            </ul>
            {rr.pool.known && <p className="mt-1.5">Every name here can be bought at the auction.</p>}
          </Note>
        </div>
      </PageHead>

      <section className="panel grid gap-6 p-5 sm:p-6 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr]" aria-label="The picks at a glance">
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
                  {p.indian ? <Tag tone="pink">Indian</Tag> : <OverseasMark country={p.country} size={13} />}
                  {p.emerging && <EmergingTag />}
                </li>
              ))}
            </ol>
          </div>
        ))}
        {em.bat.length + em.bowl.length + ind.length > 0 && (
          <div className="border-t border-line pt-5 md:col-span-2 xl:col-span-1 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
            <h2 className="display mb-3 text-[1.6rem]">
              Also buy <span className="text-[13px] font-normal text-ink-3">beyond the top 10</span>
            </h2>
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-1">
              {(['bat', 'bowl'] as const)
                .filter((role) => em[role].length > 0)
                .map((role) => (
                  <div key={role}>
                    <h3 className="mb-1.5 text-[12.5px] font-semibold uppercase tracking-wide text-gold">Emerging {role === 'bat' ? 'batters' : 'bowlers'}</h3>
                    <ol className="grid gap-1.5">
                      {em[role].map((p, i) => (
                        <li key={p.id} className="flex items-center gap-3 text-[14.5px]">
                          <span className="display num w-6 text-right text-[1.1rem] text-gold">E{i + 1}</span>
                          <a href={`#em-${p.id}`} className="font-medium hover:underline">
                            {p.name}
                          </a>
                          <Flag country={p.country} size={18} />
                          {p.indian ? <Tag tone="pink">Indian</Tag> : <OverseasMark country={p.country} size={13} />}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              {ind.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-[12.5px] font-semibold uppercase tracking-wide text-blue">Indian options</h3>
                  <ol className="grid gap-1.5">
                    {ind.map(({ p, role }, i) => (
                      <li key={p.id} className="flex items-center gap-3 text-[14.5px]">
                        <span className="display num w-6 text-right text-[1.1rem] text-blue">I{i + 1}</span>
                        <a href={`#in-${p.id}`} className="font-medium hover:underline">
                          {p.name}
                        </a>
                        <Flag country={p.country} size={18} />
                        <span className="text-[12px] text-ink-3">{role === 'bat' ? 'bat' : 'ball'}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <NeedBox />

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
              Gap-fillers first, then depth. The big number is the rank.
            </SectionHead>
            {groups.map((g) => (
              <div key={g.key} className="mb-6">
                <h3 className="mb-3 flex flex-wrap items-baseline gap-x-3 text-[15px] font-semibold">
                  <Tag tone={g.key === 'fills' ? 'pink' : 'neutral'}>{g.items.length}</Tag> {g.title}
                  <span className="text-[13px] font-normal text-ink-3">{g.note}</span>
                </h3>
                <div className="grid gap-4 xl:grid-cols-2">
                  {g.items.map(({ pk, f }) => (
                    <PickCard key={pk.p.id} p={pk.p} role={role} badge={pk.p.rank!} f={f} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      })}

      {veterans.length > 0 && (
        <div className="panel mb-6 p-4">
          <h3 className="mb-2 text-[15px] font-semibold">Short-term buys</h3>
          <Bullets
            items={[
              <>
                <b>{names(veterans)}</b>: {SHORT_TERM_AGE} or older during IPL 2027
              </>,
              'In the top 10 on what they do under pressure now; age never lowers a rating',
              'Treat them as one- or two-season buys, and the emerging picks as the players to build towards',
            ]}
          />
        </div>
      )}
      <SectionHead id="emerging" title="Emerging picks" />
      <Bullets
        className="-mt-2 mb-5"
        items={[
          <>Under 26 at the start of IPL 2027 (born on or after {fmt.date(elig.emerging_born_from)}, the IPL Emerging Player age test)</>,
          <>
            Half the top 10’s bar: {EMERGING_MIN_BALLS} pressure balls in {EMERGING_MIN_MATCHES}+ matches, {EMERGING_MIN_RECENT} of them in 2025–26
          </>,
          <>
            Same no-dip rule: every one gets <b>better</b> under pressure
          </>,
          emergingIn('bat').length + emergingIn('bowl').length > 0 && (
            <>Already in the top 10 on merit: {names([...emergingIn('bat'), ...emergingIn('bowl')])}</>
          ),
          'Best rating first',
        ]}
      />
      {(['bat', 'bowl'] as const).map((role) => (
        <div key={role} className="mb-6">
          <h3 className="mb-3 flex flex-wrap items-baseline gap-x-3 text-[15px] font-semibold">
            <Tag tone="gold">{em[role].length}</Tag> {role === 'bat' ? 'Batters' : 'Bowlers'}
            <span className="text-[13px] font-normal text-ink-3">
              {role === 'bat'
                ? 'Few young batters RR can buy have faced enough pressure yet; these are the ones who rise when they have.'
                : 'Young bowlers who save more runs when the game is close than they do normally.'}
            </span>
          </h3>
          {em[role].length === 0 ? (
            <p className="panel p-4 text-[13.5px] text-ink-3">No other {role === 'bat' ? 'batter' : 'bowler'} under 26 clears the bar without dipping.</p>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {em[role].map((p, i) => (
                <PickCard key={p.id} p={p} role={role} badge={`E${i + 1}`} f={fit(p, role, rr.gaps, targets, MIN_PHASE_BALLS / 2)} kind="emerging" />
              ))}
            </div>
          )}
        </div>
      ))}
      {ind.length > 0 && (
        <>
          <SectionHead id="indian" title="Indian options" />
          <Bullets
            className="-mt-2 mb-5"
            items={[
              <>
                <b>Why so few Indians in the top 10:</b>{' '}
                {supply
                  .map((x) => `${x.kept} of the ${x.total} qualified Indian ${x.role === 'bat' ? 'batters' : 'bowlers'} who are above average under pressure were retained`)
                  .join('; ')}
              </>,
              'Every above-average Indian left in the auction is already in the top 10',
              <>
                These are the next best: signable, in an IPL 2026 squad, {elig.indian_min[0]}+ pressure balls in {elig.indian_min[1]}+ matches, no dip,
                and about average or better (rating {signed(INDIAN_OPTION_FLOOR, 0)} or higher)
              </>,
              'Options to weigh for a squad with few overseas places, not top-10 picks',
              <>
                Domestic T20 (SMAT) is not in the ratings: the public record is too patchy (
                <Link href="/sources/#left-out" className="font-semibold text-pink-ink hover:underline">
                  why
                </Link>
                )
              </>,
            ]}
          />
          <div className="mb-6 grid gap-4 xl:grid-cols-2">
            {ind.map(({ p, role }, i) => (
              <PickCard key={p.id} p={p} role={role} badge={`I${i + 1}`} f={fit(p, role, rr.gaps, targets, MIN_PHASE_BALLS / 2)} kind="indian" />
            ))}
          </div>
        </>
      )}
      {dips.length > 0 && (
        <div className="panel mb-6 p-4">
          <h3 className="mb-1 text-[15px] font-semibold">Young names the data does not back yet</h3>
          <p className="mb-2 text-[13px] text-ink-3">50+ pressure balls and worse under pressure than usual. Maybe worth buying, but not as pressure players.</p>
          <ul className="grid gap-x-6 gap-y-1 text-[14px] sm:grid-cols-2">
            {dips.map(({ p, role }) => (
              <li key={p.id} className="flex justify-between gap-3 border-b border-line py-1">
                <Link href={`/players/${role}/${p.id}/`} className="hover:underline">
                  {p.name}
                </Link>
                <span className="num text-blue">
                  {signed(p.delta100)} lift, {role === 'bat' ? 'batting' : 'bowling'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <RetainedSquad />
    </>
  )
}

/** RR's retained players for 2027, by role: the squad the auction builds on. */
function RetainedSquad() {
  const rr = getRR()
  const squad = rr.retained_squad
  if (!squad?.length) return null
  const sl = rr.slots
  const has = (role: Role, id: number) => getRole(role).players.some((p) => p.id === id)
  const groups = [
    { key: 'batter', title: 'Batters' },
    { key: 'keeper', title: 'Wicket-keepers' },
    { key: 'allrounder', title: 'All-rounders' },
    { key: 'bowler', title: 'Bowlers' },
  ] as const
  const unseen = squad.filter((p) => p.role == null)
  return (
    <section className="panel mb-6 p-5 sm:p-6" aria-labelledby="retained-title">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="retained-title" className="display text-[1.6rem]">
          RR’s retained squad for 2027
        </h2>
        <span className="text-[13px] text-ink-3">
          {squad.length} players, {squad.filter((p) => p.overseas).length} from overseas
          {sl ? ` · ${sl.open} places open, up to ${sl.open_overseas} overseas` : ''}
        </span>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {groups.map((g) => {
          const items = squad.filter((p) => p.role === g.key)
          return (
            <div key={g.key}>
              <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-pink-ink">
                {g.title} <span className="font-normal text-ink-3">{items.length}</span>
              </h3>
              <ul className="flex flex-col gap-2">
                {items.map((p) => {
                  const prof = has('bat', p.id) && (g.key !== 'bowler' || !has('bowl', p.id)) ? 'bat' : has('bowl', p.id) ? 'bowl' : has('bat', p.id) ? 'bat' : null
                  // the stats that match his role: batting for batters and keepers, bowling for bowlers, both for all-rounders
                  const bat = g.key !== 'bowler' && p.bat26 && `${p.bat26.runs} runs, SR ${p.bat26.sr.toFixed(0)}`
                  const bowl = (g.key === 'bowler' || g.key === 'allrounder') && p.bowl26 && `${p.bowl26.wkts} wkt${p.bowl26.wkts === 1 ? '' : 's'}, econ ${p.bowl26.econ.toFixed(2)}`
                  const stats = [bat, bowl].filter(Boolean)
                  return (
                    <li key={p.id} className="text-[14px]">
                      <span className="flex items-center gap-1.5">
                        {prof ? (
                          <Link href={`/players/${prof}/${p.id}/`} className="font-medium hover:underline">
                            {p.name}
                          </Link>
                        ) : (
                          <span className="font-medium">{p.name}</span>
                        )}
                        {p.overseas && <OverseasMark size={12} />}
                        {p.role_source === 'public record' && <span className="text-[11px] text-ink-3">(role from public record)</span>}
                      </span>
                      <span className="block text-[12px] text-ink-3">
                        {stats.length ? `IPL 2026: ${stats.join(' · ')}` : `${p.matches} matches since 2024, little in 2026`}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
      <Bullets
        className="mt-4 text-[12.5px] text-ink-3"
        items={[
          'Roles come from each player’s matches since 2024 (the data has no role field)',
          'Keeper: kept wicket in a quarter of his matches; all-rounder: bowled 6+ and faced 8+ balls a match',
          'Lhuan-dre Pretorius keeps for South Africa but never did for RR, so his role comes from the public record',
          unseen.length > 0 && `Not yet seen at this level: ${unseen.map((p) => p.name).join(', ')}`,
        ]}
      />
    </section>
  )
}

/** What RR's retentions and 2026 season say they need: the context for "Fills a gap". */
function NeedBox() {
  const rr = getRR()
  const need = rr.squad_need
  const ph = (phase: string) => rr.phases.find((p) => p.phase === phase)
  const sl = rr.slots
  return (
    <section className="mt-6 rounded-lg border border-pink/30 bg-pink-soft/40 p-5" aria-labelledby="need-title">
      <h2 id="need-title" className="display mb-2 text-[1.5rem]">
        What RR need
      </h2>
      <Bullets
        className="text-ink"
        items={[
          sl && (
            <>
              <b>{sl.open} places open</b>, at most {sl.open_overseas} overseas, after {sl.retained} retentions
            </>
          ),
          <>
            <b>Batting is the thin side:</b> {need.batter + need.keeper} batters and keepers kept against {need.bowler} bowlers
          </>,
          <>
            <b>The death overs:</b> {ordinal(ph('Death')?.bat_rank ?? 0)} of 10 batting and {ordinal(ph('Death')?.bowl_rank ?? 0)} of 10 bowling in 2026
          </>,
          <>
            <b>Already strong:</b> powerplay batting, {ordinal(ph('Powerplay')?.bat_rank ?? 0)} of 10
          </>,
          <>
            Roles to fill: {rr.recommendations.map((r) => r.role.toLowerCase()).join(', ')} (see the{' '}
            <a href="#retained-title" className="font-semibold text-pink-ink hover:underline">
              retained squad
            </a>
            )
          </>,
        ]}
      />
    </section>
  )
}
