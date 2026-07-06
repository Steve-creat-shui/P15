import { cn } from "@/lib/utils"
import { motion } from "motion/react"

interface AppleButtonProps {
  variant?: "default" | "outline" | "ghost"
  size?: "sm" | "default" | "lg"
}

/**
 * Apple-style premium button with liquid glass fill.
 * Uses motion.button for tactile press animation.
 */
export function AppleButton({
  className,
  variant = "default",
  size = "default",
  children,
  disabled,
  ...props
}: React.ComponentPropsWithoutRef<"button"> & AppleButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] rounded-xl select-none"

  const variants = {
    default:
      "bg-gradient-to-r from-apple-accent-start to-apple-accent-end text-white hover:from-apple-accent-hover-start hover:to-apple-accent-hover-end shadow-[0_2px_12px_var(--apple-accent-glow-start)] hover:shadow-[0_4px_20px_var(--apple-accent-glow-start),0_2px_10px_var(--apple-accent-glow-end)]",
    outline:
      "border border-apple-glass-border bg-apple-glass-bg text-foreground hover:bg-apple-glass-bg-hover hover:border-apple-accent/30",
    ghost: "text-foreground hover:bg-apple-glass-bg-hover/80",
  }

  const sizes = {
    sm: "h-8 px-3 text-xs",
    default: "h-10 px-4 py-2 text-sm",
    lg: "h-12 px-6 text-base",
  }

  return (
    <motion.button
      data-slot="apple-button"
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 15,
      }}
      disabled={disabled}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </motion.button>
  )
}
