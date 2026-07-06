import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

export function AppleTabs(props: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="apple-tabs" className={cn("flex flex-col gap-3", props.className)} {...props} />
}

export function AppleTabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="apple-tabs-list"
      className={cn(
        "inline-flex items-center justify-center rounded-2xl p-1",
        "bg-[oklch(0.22_0.05_285)] border border-white/10",
        "gap-1",
        className
      )}
      {...props}
    />
  )
}

export function AppleTabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="apple-tabs-trigger"
      className={cn(
        "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium whitespace-nowrap",
        "text-apple-text-tertiary transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/40 focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        "data-[state=active]:bg-apple-glass-bg/90 data-[state=active]:text-apple-text-primary data-[state=active]:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]",
        "hover:text-apple-text-secondary",
        className
      )}
      {...props}
    />
  )
}

export function AppleTabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="apple-tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}
