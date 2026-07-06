import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Trash2 } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"

import { UsersService } from "@/client"
import { AppleButton } from "@/components/ui/AppleButton"
import { AppleDialog, AppleDialogClose, AppleDialogContent, AppleDialogFooter, AppleDialogHeader, AppleDialogTitle, AppleDialogDescription } from "@/components/ui/apple/AppleDialog"
import { AppleDropdownMenuItem } from "@/components/ui/apple/AppleDropdownMenu"
import { LoadingButton } from "@/components/ui/loading-button"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

interface DeleteUserProps {
  id: string
  onSuccess: () => void
}

const DeleteUser = ({ id, onSuccess }: DeleteUserProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { handleSubmit } = useForm()

  const deleteUser = async (id: string) => {
    await UsersService.deleteUser({ userId: id })
  }

  const mutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      showSuccessToast("The user was deleted successfully")
      setIsOpen(false)
      onSuccess()
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries()
    },
  })

  const onSubmit = async () => {
    mutation.mutate(id)
  }

  return (
    <AppleDialog open={isOpen} onOpenChange={setIsOpen}>
      <AppleDropdownMenuItem
        variant="destructive"
        onSelect={(e) => e.preventDefault()}
        onClick={() => setIsOpen(true)}
      >
        <Trash2 />
        Delete User
      </AppleDropdownMenuItem>
      <AppleDialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit(onSubmit)}>
          <AppleDialogHeader>
            <AppleDialogTitle>Delete User</AppleDialogTitle>
            <AppleDialogDescription>
              All items associated with this user will also be{" "}
              <strong>permanently deleted.</strong> Are you sure? You will not
              be able to undo this action.
            </AppleDialogDescription>
          </AppleDialogHeader>

          <AppleDialogFooter className="mt-4">
            <AppleDialogClose asChild>
              <AppleButton variant="outline" disabled={mutation.isPending}>
                Cancel
              </AppleButton>
            </AppleDialogClose>
            <LoadingButton
              variant="destructive"
              type="submit"
              loading={mutation.isPending}
            >
              Delete
            </LoadingButton>
          </AppleDialogFooter>
        </form>
      </AppleDialogContent>
    </AppleDialog>
  )
}

export default DeleteUser
