import { cn } from "@/lib/utils"

function AppleTable({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="apple-table-container"
      className={cn("relative w-full overflow-x-auto rounded-2xl border border-apple-glass-border/30", className)}
      {...props}
    />
  )
}

function AppleTableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="apple-table-header"
      className={cn(
        "bg-apple-glass-bg/60 backdrop-blur-xl border-b border-apple-glass-border/30",
        className
      )}
      {...props}
    />
  )
}

function AppleTableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="apple-table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function AppleTableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="apple-table-footer"
      className={cn(
        "bg-apple-glass-bg/40 border-t border-apple-glass-border/30",
        className
      )}
      {...props}
    />
  )
}

function AppleTableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="apple-table-row"
      className={cn(
        "transition-colors duration-150",
        "hover:bg-apple-glass-bg/40",
        "data-[state=selected]:bg-apple-glass-bg/60",
        "border-b border-apple-glass-border/20 last:border-0",
        className
      )}
      {...props}
    />
  )
}

function AppleTableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="apple-table-head"
      className={cn(
        "text-apple-text-tertiary h-10 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wider whitespace-nowrap",
        className
      )}
      {...props}
    />
  )
}

function AppleTableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="apple-table-cell"
      className={cn(
        "px-4 py-3 align-middle text-apple-text-primary whitespace-nowrap text-sm",
        className
      )}
      {...props}
    />
  )
}

function AppleTableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="apple-table-caption"
      className={cn("text-apple-text-tertiary mt-4 text-sm", className)}
      {...props}
    />
  )
}

export {
  AppleTable,
  AppleTableHeader,
  AppleTableBody,
  AppleTableFooter,
  AppleTableHead,
  AppleTableRow,
  AppleTableCell,
  AppleTableCaption,
}
