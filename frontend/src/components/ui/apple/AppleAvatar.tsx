import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"

export function AppleAvatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="apple-avatar"
      className={cn(
        "relative flex size-8 shrink-0 overflow-hidden rounded-full",
        "ring-2 ring-apple-glass-border/50",
        className
      )}
      {...props}
    />
  )
}

export function AppleAvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="apple-avatar-image"
      className={cn("aspect-square size-full object-cover", className)}
      {...props}
    />
  )
}

export function AppleAvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="apple-avatar-fallback"
      className={cn(
        "bg-apple-glass-bg backdrop-blur-sm flex size-full items-center justify-center rounded-full text-apple-text-secondary text-xs font-medium",
        className
      )}
      {...props}
    />
  )
}
