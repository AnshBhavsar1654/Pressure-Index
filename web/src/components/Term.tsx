'use client'

import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { term, type TermKey } from '@/lib/terms'
import type { Role } from '@/lib/types'
import { cn } from '@/lib/utils'

/** A statistic's name with its plain-words explanation on hover or focus. */
export function Term({ k, role = 'bat', children, className }: { k: TermKey; role?: Role; children?: ReactNode; className?: string }) {
  const t = term(k, role)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className={cn('cursor-help underline decoration-dotted decoration-from-font underline-offset-[3px]', className)}>
          {children ?? t.label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-[12.5px] leading-snug">{t.def}</TooltipContent>
    </Tooltip>
  )
}
