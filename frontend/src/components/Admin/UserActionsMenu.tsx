import { EllipsisVertical } from "lucide-react"
import { useState } from "react"

import type { UserPublic } from "@/client"
import { AppleButton } from "@/components/ui/AppleButton"
import {
  AppleDropdownMenu,
  AppleDropdownMenuContent,
  AppleDropdownMenuTrigger,
} from "@/components/ui/apple/AppleDropdownMenu"
import { cn } from "@/lib/utils"
import useAuth from "@/hooks/useAuth"
import DeleteUser from "./DeleteUser"
import EditUser from "./EditUser"

interface UserActionsMenuProps {
  user: UserPublic
}

export const UserActionsMenu = ({ user }: UserActionsMenuProps) => {
  const [open, setOpen] = useState(false)
  const { user: currentUser } = useAuth()

  if (user.id === currentUser?.id) {
    return null
  }

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
        <EditUser user={user} onSuccess={() => setOpen(false)} />
        <DeleteUser id={user.id} onSuccess={() => setOpen(false)} />
      </AppleDropdownMenuContent>
    </AppleDropdownMenu>
  )
}
