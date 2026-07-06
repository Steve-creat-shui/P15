import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { UsersService, type UserUpdateMe } from "@/client"
import { AppleButton } from "@/components/ui/AppleButton"
import { LoadingButton } from "@/components/ui/loading-button"
import { GlassCard } from "@/components/ui/GlassCard"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import { cn } from "@/lib/utils"
import { handleError } from "@/utils"

const formSchema = z.object({
  full_name: z.string().max(30).optional(),
  email: z.email({ message: "Invalid email address" }),
})

type FormData = z.infer<typeof formSchema>

const UserInformation = () => {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [editMode, setEditMode] = useState(false)
  const { user: currentUser } = useAuth()

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      full_name: currentUser?.full_name ?? undefined,
      email: currentUser?.email,
    },
  })

  const toggleEditMode = () => {
    setEditMode(!editMode)
  }

  const mutation = useMutation({
    mutationFn: (data: UserUpdateMe) =>
      UsersService.updateUserMe({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("User updated successfully")
      toggleEditMode()
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries()
    },
  })

  const onSubmit = (data: FormData) => {
    const updateData: UserUpdateMe = {}

    // only include fields that have changed
    if (data.full_name !== currentUser?.full_name) {
      updateData.full_name = data.full_name
    }
    if (data.email !== currentUser?.email) {
      updateData.email = data.email
    }

    mutation.mutate(updateData)
  }

  const onCancel = () => {
    form.reset()
    toggleEditMode()
  }

  return (
    <GlassCard>
      <h3 className="text-lg font-semibold py-4 px-6">User Information</h3>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4 px-6 pb-6"
      >
        <div>
          {editMode ? (
            <>
              <label className="text-sm font-medium text-apple-text-secondary">
                Full name
              </label>
              <input
                type="text"
                className="flex h-11 w-full rounded-xl border border-apple-glass-border/50 bg-apple-glass-bg/70 backdrop-blur-sm px-3.5 py-2.5 text-sm text-apple-text-primary placeholder:text-apple-text-tertiary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/40 focus-visible:border-apple-accent/50 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                {...form.register("full_name")}
              />
              {form.formState.errors.full_name && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.full_name.message}</p>
              )}
            </>
          ) : (
            <>
              <label className="text-sm font-medium text-apple-text-secondary">
                Full name
              </label>
              <p
                className={cn(
                  "py-2 truncate max-w-sm",
                  !form.getValues("full_name") && "text-apple-text-secondary",
                )}
              >
                {form.getValues("full_name") || "N/A"}
              </p>
            </>
          )}
        </div>

        <div>
          {editMode ? (
            <>
              <label className="text-sm font-medium text-apple-text-secondary">
                Email
              </label>
              <input
                type="email"
                className="flex h-11 w-full rounded-xl border border-apple-glass-border/50 bg-apple-glass-bg/70 backdrop-blur-sm px-3.5 py-2.5 text-sm text-apple-text-primary placeholder:text-apple-text-tertiary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/40 focus-visible:border-apple-accent/50 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                {...form.register("email")}
              />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.email.message}</p>
              )}
            </>
          ) : (
            <>
              <label className="text-sm font-medium text-apple-text-secondary">
                Email
              </label>
              <p className="py-2 truncate max-w-sm">{form.getValues("email")}</p>
            </>
          )}
        </div>

        <div className="flex gap-3">
          {editMode ? (
            <>
              <LoadingButton
                type="submit"
                loading={mutation.isPending}
                disabled={!form.formState.isDirty}
              >
                Save
              </LoadingButton>
              <AppleButton
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={mutation.isPending}
              >
                Cancel
              </AppleButton>
            </>
          ) : (
            <AppleButton type="button" onClick={toggleEditMode}>
              Edit
            </AppleButton>
          )}
        </div>
      </form>
    </GlassCard>
  )
}

export default UserInformation
