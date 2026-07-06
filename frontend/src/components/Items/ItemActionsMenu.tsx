import { EllipsisVertical } from "lucide-react"
import { useState } from "react"

import type { ItemPublic } from "@/client"
import { AppleButton } from "@/components/ui/AppleButton"
import {
  AppleDropdownMenu,
  AppleDropdownMenuContent,
  AppleDropdownMenuTrigger,
} from "@/components/ui/apple/AppleDropdownMenu"
import { cn } from "@/lib/utils"
import DeleteItem from "../Items/DeleteItem"
import EditItem from "../Items/EditItem"

interface ItemActionsMenuProps {
  item: ItemPublic
}

export const ItemActionsMenu = ({ item }: ItemActionsMenuProps) => {
  const [open, setOpen] = useState(false)

  return (
    <AppleDropdownMenu open={open} onOpenChange={setOpen}>
      <AppleDropdownMenuTrigger asChild>
        <AppleButton
          variant="ghost"
          className={cn(
            "size-8 p-0",
          )}
        >
          <EllipsisVertical className="size-4" />
        </AppleButton>
      </AppleDropdownMenuTrigger>
      <AppleDropdownMenuContent align="end">
        <EditItem item={item} onSuccess={() => setOpen(false)} />
        <DeleteItem id={item.id} onSuccess={() => setOpen(false)} />
      </AppleDropdownMenuContent>
    </AppleDropdownMenu>
  )
}
