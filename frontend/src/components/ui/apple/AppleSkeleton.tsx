import { cn } from "@/lib/utils"

interface AppleSkeletonProps extends React.ComponentProps<"div"> {
  shimmer?: boolean
}

export function AppleSkeleton({ className, shimmer = true, ...props }: AppleSkeletonProps) {
  return (
    <div
      data-slot="apple-skeleton"
      className={cn(
        "rounded-xl bg-apple-glass-bg/40",
        shimmer && "animate-pulse relative overflow-hidden",
        shimmer && "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-apple-glass-bg-hover before:to-transparent",
        className
      )}
      {...props}
    />
  )
}
