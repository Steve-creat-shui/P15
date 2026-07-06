import * as SelectPrimitive from "@radix-ui/react-select"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export function AppleSelect(props: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="apple-select" {...props} />
}

export function AppleSelectGroup(props: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="apple-select-group" {...props} />
}

export function AppleSelectValue(props: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="apple-select-value" {...props} />
}

export function AppleSelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & { size?: "sm" | "default" }) {
  return (
    <SelectPrimitive.Trigger
      data-slot="apple-select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-2 rounded-xl border border-apple-glass-border/50",
        "bg-apple-glass-bg/70 backdrop-blur-sm",
        "text-sm text-apple-text-primary px-3.5 py-2.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/40 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "transition-all duration-200",
        "data-[size=default]:h-11 data-[size=sm]:h-9",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 opacity-50 text-apple-text-tertiary" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

export function AppleSelectContent({
  className,
  children,
  position = "popper",
  align = "center",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="apple-select-content"
        className={cn(
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-xl border border-apple-glass-border/50",
          "bg-apple-glass-bg/95 backdrop-blur-xl text-apple-text-primary shadow-[var(--apple-glass-shadow)]",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className
        )}
        position={position}
        align={align}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "p-1.5",
            position === "popper" &&
              "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1"
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

export function AppleSelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="apple-select-label"
      className={cn("px-3 py-2 text-xs font-medium text-apple-text-tertiary uppercase tracking-wider", className)}
      {...props}
    />
  )
}

export function AppleSelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="apple-select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-lg px-3 py-2 text-sm select-none outline-none",
        "text-apple-text-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "data-[highlighted]:bg-apple-accent/10 data-[highlighted]:text-apple-text-primary",
        "transition-colors duration-150",
        className
      )}
      {...props}
    >
      <span className="absolute right-3 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

export function AppleSelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="apple-select-separator"
      className={cn("-mx-1 my-1 h-px bg-apple-glass-border/40", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      className={cn("flex cursor-default items-center justify-center py-2 text-apple-text-tertiary", className)}
      {...props}
    >
      <ChevronUpIcon className="size-3" />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      className={cn("flex cursor-default items-center justify-center py-2 text-apple-text-tertiary", className)}
      {...props}
    >
      <ChevronDownIcon className="size-3" />
    </SelectPrimitive.ScrollDownButton>
  )
}
