import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"

import { UsersService } from "@/client"
import { AppleButton } from "@/components/ui/AppleButton"
import { cn } from "@/lib/utils"
import { AppleDialog, AppleDialogClose, AppleDialogContent, AppleDialogFooter, AppleDialogHeader, AppleDialogTitle, AppleDialogDescription, AppleDialogTrigger } from "@/components/ui/apple/AppleDialog"
import { LoadingButton } from "@/components/ui/loading-button"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

const DeleteConfirmation = () => {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { handleSubmit } = useForm()
  const { logout } = useAuth()

  const mutation = useMutation({
    mutationFn: () => UsersService.deleteUserMe(),
    onSuccess: () => {
      showSuccessToast("Your account has been successfully deleted")
      logout()
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
    },
  })

  const onSubmit = async () => {
    mutation.mutate()
  }

  return (
    <AppleDialog>
      <AppleDialogTrigger asChild>
        <AppleButton
          className={cn(
            "mt-3 bg-destructive/80 hover:bg-destructive text-white",
            "shadow-[0_2px_12px_rgba(220,38,38,0.3)] hover:shadow-[0_4px_20px_rgba(220,38,38,0.4)]",
          )}
        >
          Delete Account
        </AppleButton>
      </AppleDialogTrigger>
      <AppleDialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <AppleDialogHeader>
            <AppleDialogTitle>Confirmation Required</AppleDialogTitle>
            <AppleDialogDescription>
              All your account data will be{" "}
              <strong>permanently deleted.</strong> If you are sure, please
              click <strong>"Confirm"</strong> to proceed. This action cannot be
              undone.
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

export default DeleteConfirmation
