import type { SVGProps } from 'react'

type P = { size?: number | string; weight?: 'regular' | 'fill' } & Omit<SVGProps<SVGSVGElement>, 'width' | 'height'>

/**
 * Cricket bat, drawn upright and tilted 45 degrees: narrow rounded handle, a shoulder that
 * flares into a long flat blade, and a centre ridge on the line version.
 */
export function BatIcon({ size = 19, weight = 'regular', ...rest }: P) {
  const fill = weight === 'fill'
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      <g transform="rotate(45 128 128)">
        <path
          d="M120 14 H136 V88 L158 108 V222 A14 14 0 0 1 144 236 H112 A14 14 0 0 1 98 222 V108 L120 88 Z"
          fill={fill ? 'currentColor' : 'none'}
        />
        {!fill && <path d="M128 120 V206" />}
      </g>
    </svg>
  )
}

/** Cricket ball: circle with the raised seam. */
export function BallIcon({ size = 19, weight = 'regular', ...rest }: P) {
  const fill = weight === 'fill'
  const seam = fill ? 'var(--signal)' : 'currentColor'
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      <circle cx="128" cy="128" r="96" fill={fill ? 'currentColor' : 'none'} />
      <path d="M62 60 C100 100 100 156 62 196" stroke={seam} />
      <path d="M194 60 C156 100 156 156 194 196" stroke={seam} />
    </svg>
  )
}
