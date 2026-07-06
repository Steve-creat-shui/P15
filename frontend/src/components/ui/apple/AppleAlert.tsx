import { cn } from "@/lib/utils"

const alertVariants = {
  default: "border-apple-glass-border/40 bg-apple-glass-bg/80 backdrop-blur-xl text-apple-text-primary",
  destructive: "border-destructive/30 bg-destructive/5 backdrop-blur-xl text-destructive",
}

interface AppleAlertProps extends React.ComponentProps<"div"> {
  variant?: "default" | "destructive"
}

export function AppleAlert({
  className,
  variant = "default",
  ...props
}: AppleAlertProps) {
  return (
    <div
      data-slot="apple-alert"
      role="alert"
      className={cn(
        "relative w-full rounded-2xl border px-5 py-4 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
        alertVariants[variant],
        "shadow-[inset_0_1px_0_0_var(--apple-glass-highlight)]",
        className
      )}
      {...props}
    />
  )
}

export function AppleAlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="apple-alert-title"
      className={cn(
        "col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight text-apple-text-primary",
        className
      )}
      {...props}
    />
  )
}

export function AppleAlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="apple-alert-description"
      className={cn(
        "col-start-2 text-apple-text-secondary grid justify-items-start gap-1 text-sm [&_p]:leading-relaxed",
        className
      )}
      {...props}
    />
  )
}
