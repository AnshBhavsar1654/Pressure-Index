import { cn } from '@/lib/utils'

/**
 * Country flags (SVG, from the MIT-licensed country-flag-icons package, copied to
 * public/flags). West Indies is a cricket federation with no national flag, so it
 * gets a maroon "WI" plate instead.
 */
const CODES: Record<string, string> = {
  Afghanistan: 'AF',
  Australia: 'AU',
  Bangladesh: 'BD',
  Canada: 'CA',
  England: 'GB-ENG',
  'Hong Kong': 'HK',
  India: 'IN',
  'India (uncapped)': 'IN',
  Ireland: 'IE',
  Namibia: 'NA',
  Nepal: 'NP',
  Netherlands: 'NL',
  'New Zealand': 'NZ',
  Oman: 'OM',
  Pakistan: 'PK',
  Scotland: 'GB-SCT',
  'South Africa': 'ZA',
  'Sri Lanka': 'LK',
  'United Arab Emirates': 'AE',
  'United States Of America': 'US',
  Zimbabwe: 'ZW',
}

export function Flag({ country, size = 18, className }: { country: string | null | undefined; size?: number; className?: string }) {
  if (!country) return null
  const label = country === 'India (uncapped)' ? 'India, uncapped' : country
  const h = Math.round((size * 2) / 3)
  const code = CODES[country]
  if (!code) {
    const short = country === 'West Indies' ? 'WI' : country.slice(0, 3).toUpperCase()
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        className={cn('inline-grid shrink-0 place-items-center rounded-[3px] font-display font-extrabold leading-none text-white ring-1 ring-black/20', className)}
        style={{ width: size, height: h, fontSize: h * 0.62, background: country === 'West Indies' ? '#7b0f2a' : 'var(--ink-3)' }}
      >
        {short}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/flags/${code}.svg`}
      alt={label}
      title={label}
      width={size}
      height={h}
      className={cn('inline-block shrink-0 rounded-[3px] object-cover ring-1 ring-black/20', className)}
    />
  )
}
