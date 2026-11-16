export const fmt = {
  int: (n: number) => n.toLocaleString('en-IN'),
  dec: (n: number | null | undefined, d = 1) => (n == null || Number.isNaN(n) ? '–' : n.toFixed(d)),
  signed: (n: number | null | undefined, d = 1) =>
    n == null || Number.isNaN(n) ? '–' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(d)}`,
  pct: (n: number | null | undefined, d = 0) => (n == null ? '–' : `${(n * 100).toFixed(d)}%`),
  date: (s: string) =>
    new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
}

/** Short IPL franchise codes for compact tables. */
const IPL_CODES: Record<string, string> = {
  'Rajasthan Royals': 'RR',
  'Mumbai Indians': 'MI',
  'Chennai Super Kings': 'CSK',
  'Royal Challengers Bengaluru': 'RCB',
  'Royal Challengers Bangalore': 'RCB',
  'Kolkata Knight Riders': 'KKR',
  'Sunrisers Hyderabad': 'SRH',
  'Delhi Capitals': 'DC',
  'Punjab Kings': 'PBKS',
  'Lucknow Super Giants': 'LSG',
  'Gujarat Titans': 'GT',
}
export const iplCode = (t: string | null) => (t ? (IPL_CODES[t] ?? t) : null)
