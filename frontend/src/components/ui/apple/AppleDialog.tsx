import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function AppleDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="apple-dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40 backdrop-blur-sm",
        className
      )}
      {...props}
    />
  )
}

export function AppleDialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPrimitive.Portal>
      <AppleDialogOverlay />
      <DialogPrimitive.Content
        data-slot="apple-dialog-content"
        className={cn(
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-0 rounded-2xl border border-apple-glass-border/50 p-0 shadow-[var(--apple-glass-shadow-lg)] duration-200 sm:max-w-lg",
          "bg-apple-glass-bg/90 backdrop-blur-xl text-apple-text-primary",
          "before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:shadow-[inset_0_1px_0_0_var(--apple-glass-highlight)]",
          className
        )}
        {...props}
      >
        <div className="flex flex-col gap-4 p-6">
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              data-slot="apple-dialog-close"
              className="ring-offset-background focus:ring-ring data-[state=open]:bg-muted/50 absolute top-4 right-4 rounded-full opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function AppleDialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="apple-dialog" {...props} />
}

export function AppleDialogTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="apple-dialog-trigger" {...props} />
}

export function AppleDialogClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="apple-dialog-close" {...props} />
}

export function AppleDialogPortal(props: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="apple-dialog-portal" {...props} />
}

export function AppleDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="apple-dialog-title"
      className={cn("text-lg leading-none font-semibold text-apple-text-primary", className)}
      {...props}
    />
  )
}

export function AppleDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="apple-dialog-description"
      className={cn("text-apple-text-secondary text-sm", className)}
      {...props}
    />
  )
}

export function AppleDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="apple-dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

export function AppleDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="apple-dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  )
}
