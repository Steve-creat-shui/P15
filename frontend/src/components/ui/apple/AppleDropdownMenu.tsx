import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export function AppleDropdownMenu(props: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="apple-dropdown-menu" {...props} />
}

export function AppleDropdownMenuPortal(props: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return <DropdownMenuPrimitive.Portal data-slot="apple-dropdown-menu-portal" {...props} />
}

export function AppleDropdownMenuTrigger(props: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="apple-dropdown-menu-trigger" {...props} />
}

export function AppleDropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="apple-dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          "z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-2xl border border-apple-glass-border/40 p-1.5 shadow-[var(--apple-glass-shadow-lg)]",
          "bg-apple-glass-bg/95 backdrop-blur-xl text-apple-text-primary",
          "before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:shadow-[inset_0_1px_0_0_var(--apple-glass-highlight)]",
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

export function AppleDropdownMenuGroup(props: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return <DropdownMenuPrimitive.Group data-slot="apple-dropdown-menu-group" {...props} />
}

export function AppleDropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="apple-dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "focus:bg-apple-glass-bg-hover/80 focus:text-apple-text-primary",
        "data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10",
        "data-[variant=destructive]:focus:text-destructive",
        "relative flex cursor-default items-center gap-2 rounded-lg px-3 py-2 text-sm outline-hidden select-none",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "data-[inset]:pl-8",
        "transition-colors duration-150",
        "data-[highlighted]:bg-apple-glass-bg-hover/60",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-apple-text-tertiary",
        className
      )}
      {...props}
    />
  )
}

export function AppleDropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="apple-dropdown-menu-checkbox-item"
      className={cn(
        "focus:bg-apple-glass-bg-hover/80 focus:text-apple-text-primary relative flex cursor-default items-center gap-2 rounded-lg px-3 py-2 text-sm outline-hidden select-none",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "transition-colors duration-150",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      checked={checked}
      {...props}
    >
      <span className="pointer-events-none absolute left-3 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

export function AppleDropdownMenuRadioGroup(props: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return <DropdownMenuPrimitive.RadioGroup data-slot="apple-dropdown-menu-radio-group" {...props} />
}

export function AppleDropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="apple-dropdown-menu-radio-item"
      className={cn(
        "focus:bg-apple-glass-bg-hover/80 focus:text-apple-text-primary relative flex cursor-default items-center gap-2 rounded-lg px-3 py-2 text-sm outline-hidden select-none",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "transition-colors duration-150",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span className="pointer-events-none absolute left-3 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CircleIcon className="size-2 fill-current" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
}

export function AppleDropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="apple-dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-3 py-1.5 text-xs font-semibold text-apple-text-tertiary uppercase tracking-wider data-[inset]:pl-8",
        className
      )}
      {...props}
    />
  )
}

export function AppleDropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="apple-dropdown-menu-separator"
      className={cn("my-1.5 h-px bg-apple-glass-border/40 -mx-1.5", className)}
      {...props}
    />
  )
}

export function AppleDropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="apple-dropdown-menu-shortcut"
      className={cn("text-apple-text-tertiary ml-auto text-[10px] tracking-widest", className)}
      {...props}
    />
  )
}

export function AppleDropdownMenuSub(props: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return <DropdownMenuPrimitive.Sub data-slot="apple-dropdown-menu-sub" {...props} />
}

export function AppleDropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="apple-dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "focus:bg-apple-glass-bg-hover/80 focus:text-apple-text-primary data-[state=open]:bg-apple-glass-bg-hover/80 data-[state=open]:text-apple-text-primary",
        "flex cursor-default items-center rounded-lg px-3 py-2 text-sm outline-hidden select-none",
        "data-[inset]:pl-8 transition-colors duration-150",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto size-3.5 text-apple-text-tertiary" />
    </DropdownMenuPrimitive.SubTrigger>
  )
}

export function AppleDropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.SubContent
      data-slot="apple-dropdown-menu-sub-content"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "z-50 min-w-[8rem] overflow-hidden rounded-xl border border-apple-glass-border/40 p-1.5 shadow-[var(--apple-glass-shadow)]",
        "bg-apple-glass-bg/95 backdrop-blur-xl text-apple-text-primary",
        className
      )}
      {...props}
    />
  )
}
