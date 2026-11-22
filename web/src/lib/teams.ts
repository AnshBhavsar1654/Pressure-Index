/**
 * IPL sides: a short code for compact tables and chips. Team identity is shown as a neutral mono code
 * chip, never in club colours: the dashboard's colour is reserved for data.
 */
export type Team = { code: string; name: string }

export const TEAMS: Record<string, Team> = {
  'Chennai Super Kings': { code: 'CSK', name: 'Chennai Super Kings' },
  'Delhi Capitals': { code: 'DC', name: 'Delhi Capitals' },
  'Gujarat Titans': { code: 'GT', name: 'Gujarat Titans' },
  'Kolkata Knight Riders': { code: 'KKR', name: 'Kolkata Knight Riders' },
  'Lucknow Super Giants': { code: 'LSG', name: 'Lucknow Super Giants' },
  'Mumbai Indians': { code: 'MI', name: 'Mumbai Indians' },
  'Punjab Kings': { code: 'PBKS', name: 'Punjab Kings' },
  'Rajasthan Royals': { code: 'RR', name: 'Rajasthan Royals' },
  'Royal Challengers Bengaluru': { code: 'RCB', name: 'Royal Challengers Bengaluru' },
  'Sunrisers Hyderabad': { code: 'SRH', name: 'Sunrisers Hyderabad' },
}

export const teamOf = (name: string | null | undefined): Team | undefined => (name ? TEAMS[name] : undefined)

/** URL slug for a team page: the short code, lower case. */
export const teamSlug = (name: string) => (TEAMS[name]?.code ?? name).toLowerCase()
export const teamBySlug = (slug: string) => Object.values(TEAMS).find((t) => t.code.toLowerCase() === slug)
