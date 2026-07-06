import { cn } from "@/lib/utils"
import { motion } from "motion/react"
import { Loader2 } from "lucide-react"

interface AppleLoadingButtonProps extends React.ComponentPropsWithoutRef<"button"> {
  loading?: boolean
}

export function AppleLoadingButton({
  className,
  loading = false,
  children,
  disabled,
  ...props
}: AppleLoadingButtonProps) {
  const isDisabled = disabled || loading

  return (
    <motion.button
      data-slot="apple-loading-button"
      className={cn(
        "inline-flex h-11 w-full items-center justify-center gap-2 font-medium transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/50 focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] select-none rounded-xl",
        "bg-gradient-to-r from-apple-accent-start to-apple-accent-end text-white hover:from-apple-accent-hover-start hover:to-apple-accent-hover-end shadow-[0_2px_12px_var(--apple-accent-glow)] hover:shadow-[0_4px_20px_var(--apple-accent-glow-start),0_2px_10px_var(--apple-accent-glow-end)]",
        "text-sm px-4 py-2",
        className
      )}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 15,
      }}
      disabled={isDisabled}
      {...(props as Record<string, unknown>)}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </motion.button>
  )
}
