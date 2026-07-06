import { cn } from "@/lib/utils"

interface AppleInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

/**
 * Apple-style refined input with frosted focus state.
 */
export function AppleInput({
  className,
  label,
  error,
  disabled,
  ...props
}: AppleInputProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-sm font-medium text-apple-text-secondary">
          {label}
        </label>
      )}
      <input
        data-slot="apple-input"
        className={cn(
          "flex h-11 w-full rounded-xl border border-apple-glass-border/50",
          "bg-apple-glass-bg/70 backdrop-blur-sm px-3.5 py-2.5",
          "text-sm text-apple-text-primary placeholder:text-apple-text-tertiary/70",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/40 focus-visible:ring-offset-2",
          "focus-visible:border-apple-accent/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "transition-all duration-200",
          error && "border-destructive focus-visible:ring-destructive/40",
          className,
        )}
        disabled={disabled}
        {...props}
      />
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  )
}
