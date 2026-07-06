import { cn } from "@/lib/utils"

interface GlassCardProps extends React.ComponentProps<"div"> {
  children: React.ReactNode
  hover?: boolean
  elevated?: boolean
}

/**
 * Apple-style frosted glass card.
 * Works with both the existing shadcn tokens AND the new .apple-theme tokens.
 * Gracefully degrades when .apple-theme is not present.
 */
export function GlassCard({
  className,
  children,
  hover = true,
  elevated = false,
  ...props
}: GlassCardProps) {
  return (
    <div
      data-slot="glass-card"
      className={cn(
        "relative rounded-2xl border border-apple-glass-border/50",
        // Warm gradient border overlay on hover
        "before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:overflow-hidden before:shadow-[inset_0_1px_0_0_var(--apple-glass-highlight)]",
        // Glass material with warm tint
        "backdrop-blur-xl bg-apple-glass-bg text-foreground",
        // Warm glow shadow
        elevated
          ? "shadow-[var(--apple-glass-shadow-lg)]"
          : "shadow-[var(--apple-glass-shadow)]",
        // Hover state: warmer tint
        hover && "transition-all duration-300 ease-out hover:shadow-[var(--apple-glass-shadow-lg)] hover:-translate-y-0.5 hover:bg-apple-glass-bg-hover",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
