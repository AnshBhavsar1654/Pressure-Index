'use client'

import { XIcon } from '@phosphor-icons/react'
import { Dialog as Primitive } from 'radix-ui'
import type { ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { DialogOverlay } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// Left-side sheet adapted from the shadcn/ui Radix Nova registry.
export const Sheet = Primitive.Root
export const SheetTrigger = Primitive.Trigger
export const SheetTitle = Primitive.Title
export const SheetDescription = Primitive.Description

export function SheetContent({ className, children, ...props }: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <DialogOverlay className="bg-ink/30 backdrop-blur-none motion-reduce:animate-none dark:bg-black/50" />
      <Primitive.Content
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-[min(20rem,calc(100vw-3rem))] overflow-y-auto overscroll-contain border-r border-line bg-rail px-4 py-5 text-rail-ink outline-none',
          'duration-200 data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left motion-reduce:animate-none',
          className,
        )}
        {...props}
      >
        {children}
        <Primitive.Close asChild>
          <Button variant="ghost" size="icon" className="absolute right-3 top-3" aria-label="Close navigation">
            <XIcon />
          </Button>
        </Primitive.Close>
      </Primitive.Content>
    </Primitive.Portal>
  )
}
