'use client'

import { AirplaneTiltIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

/** Segmented filter for 2 to 5 mutually exclusive options. */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  className?: string
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      className={cn('rounded-full border border-line bg-panel-2/70 p-1', className)}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          className="h-8 rounded-full px-3 text-[13px] text-ink-2 data-[state=on]:bg-pink data-[state=on]:text-white"
        >
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** Dropdown filter with an "all" option first. */
export function Pick({
  label,
  value,
  onChange,
  options,
  allLabel,
  className,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
  allLabel: string
  className?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={cn('h-10 min-w-40 rounded-full bg-panel-2/70', className)}>
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="all">{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export type Nat = 'all' | 'india' | 'overseas'
export const NAT_OPTIONS: { value: Nat; label: ReactNode }[] = [
  { value: 'all', label: 'All' },
  { value: 'india', label: 'Indian' },
  {
    value: 'overseas',
    label: (
      <span className="flex items-center gap-1.5">
        <AirplaneTiltIcon weight="fill" aria-hidden />
        Overseas
      </span>
    ),
  },
]
export const isIndian = (country: string | null | undefined) => !country || country.startsWith('India')
export const natMatch = (nat: Nat, country: string | null | undefined, overseas?: boolean) =>
  nat === 'all' || (nat === 'india' ? (overseas === undefined ? isIndian(country) : !overseas) : overseas === undefined ? !isIndian(country) : overseas)
