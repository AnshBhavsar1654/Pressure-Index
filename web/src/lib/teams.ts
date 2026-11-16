/**
 * IPL sides: short code, primary kit colour and the ink that reads on it.
 *
 * `logo` is optional. To show an official logo instead of the kit-colour crest,
 * put the image in web/public/logos/ (for example RR.png) and set logo: '/logos/RR.png'.
 * Official logos are trademarked, so they are not bundled with this project.
 */
export type Team = { code: string; name: string; color: string; ink: string; logo?: string }

export const TEAMS: Record<string, Team> = {
  'Rajasthan Royals': { code: 'RR', name: 'Rajasthan Royals', color: '#ec2a8e', ink: '#ffffff' },
  'Chennai Super Kings': { code: 'CSK', name: 'Chennai Super Kings', color: '#f9cd05', ink: '#1b2a5c' },
  'Delhi Capitals': { code: 'DC', name: 'Delhi Capitals', color: '#2457c5', ink: '#ffffff' },
  'Gujarat Titans': { code: 'GT', name: 'Gujarat Titans', color: '#1b2a5c', ink: '#d8b56a' },
  'Kolkata Knight Riders': { code: 'KKR', name: 'Kolkata Knight Riders', color: '#5b2c9f', ink: '#f2c94c' },
  'Lucknow Super Giants': { code: 'LSG', name: 'Lucknow Super Giants', color: '#0fa3dc', ink: '#ffffff' },
  'Mumbai Indians': { code: 'MI', name: 'Mumbai Indians', color: '#0a63c9', ink: '#f2c94c' },
  'Punjab Kings': { code: 'PBKS', name: 'Punjab Kings', color: '#ed1b24', ink: '#ffffff' },
  'Royal Challengers Bengaluru': { code: 'RCB', name: 'Royal Challengers Bengaluru', color: '#a50f1d', ink: '#f2c94c' },
  'Royal Challengers Bangalore': { code: 'RCB', name: 'Royal Challengers Bengaluru', color: '#a50f1d', ink: '#f2c94c' },
  'Sunrisers Hyderabad': { code: 'SRH', name: 'Sunrisers Hyderabad', color: '#ff7a1a', ink: '#1a1a1a' },
}

export const teamOf = (name: string | null | undefined): Team | undefined => (name ? TEAMS[name] : undefined)

/** The nine opponents, for chart keys (RR is styled separately). */
export const OPPONENTS = Object.values(TEAMS).filter((t, i, a) => t.code !== 'RR' && a.findIndex((x) => x.code === t.code) === i)
