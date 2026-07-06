import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 transition-all duration-200",
  {
    variants: {
      variant: {
        default:
          "border-apple-glass-border/40 bg-apple-glass-bg/60 backdrop-blur-sm text-apple-text-primary",
        secondary:
          "border-apple-glass-border/40 bg-apple-glass-bg/40 backdrop-blur-sm text-apple-text-secondary",
        destructive:
          "border-destructive/30 bg-destructive/10 text-destructive backdrop-blur-sm",
        outline:
          "border-apple-glass-border/40 bg-transparent text-apple-text-secondary backdrop-blur-sm",
        accent:
          "border-apple-accent/30 bg-apple-accent/10 text-apple-accent backdrop-blur-sm",
        success:
          "border-emerald-400/30 bg-emerald-400/10 text-emerald-400 backdrop-blur-sm",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

interface AppleBadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof badgeVariants> {
  asChild?: boolean
}

export function AppleBadge({
  className,
  variant,
  asChild = false,
  ...props
}: AppleBadgeProps) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="apple-badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { badgeVariants }
