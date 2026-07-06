import * as React from "react"
import { Eye, EyeOff } from "lucide-react"

import { cn } from "@/lib/utils"

interface ApplePasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string
}

const ApplePasswordInput = React.forwardRef<HTMLInputElement, ApplePasswordInputProps>(
  ({ className, error, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false)

    return (
      <div className="relative">
        <input
          type={showPassword ? "text" : "password"}
          data-slot="apple-password-input"
          className={cn(
            "flex h-11 w-full rounded-xl border border-apple-glass-border/50",
            "bg-apple-glass-bg/70 backdrop-blur-sm px-3.5 py-2.5 pr-10",
            "text-sm text-apple-text-primary placeholder:text-apple-text-tertiary/70",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/40 focus-visible:ring-offset-2",
            "focus-visible:border-apple-accent/50",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "transition-all duration-200",
            error && "border-destructive focus-visible:ring-destructive/40",
            className
          )}
          ref={ref}
          aria-invalid={!!error}
          {...props}
        />
        <button
          type="button"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-apple-text-tertiary hover:text-apple-text-secondary transition-colors"
          onClick={() => setShowPassword(!showPassword)}
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>
    )
  }
)

ApplePasswordInput.displayName = "ApplePasswordInput"

export { ApplePasswordInput }
