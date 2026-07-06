import { Link } from "@tanstack/react-router"

import { cn } from "@/lib/utils"

interface LogoProps {
  variant?: "full" | "icon" | "responsive"
  className?: string
  asLink?: boolean
}

export function Logo({
  variant = "full",
  className,
  asLink = true,
}: LogoProps) {
  const content =
    variant === "responsive" ? (
      <>
        <span
          className={cn(
            "flex items-center gap-2 font-semibold tracking-tight text-apple-text-primary group-data-[collapsible=icon]:hidden",
            className,
          )}
        >
          <span className="flex size-6 items-center justify-center rounded-lg bg-gradient-to-br from-apple-accent-start to-apple-accent-end text-[10px] font-bold text-white">
            J
          </span>
          <span className="text-sm">JEVS</span>
        </span>
        <span className="hidden size-6 items-center justify-center rounded-lg bg-apple-accent text-[10px] font-bold text-white group-data-[collapsible=icon]:flex">
          J
        </span>
      </>
    ) : variant === "icon" ? (
      <span
        className={cn(
          "flex size-6 items-center justify-center rounded-lg bg-apple-accent text-[10px] font-bold text-white",
          className,
        )}
      >
        J
      </span>
    ) : (
      <span className={cn("flex items-center gap-2 font-semibold tracking-tight text-apple-text-primary", className)}>
        <span className="flex size-6 items-center justify-center rounded-lg bg-apple-accent text-[10px] font-bold text-white">
          J
        </span>
        <span className="text-sm">JEVS</span>
      </span>
    )

  if (!asLink) {
    return content
  }

  return <Link to="/">{content}</Link>
}
