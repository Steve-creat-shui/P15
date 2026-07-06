import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Pencil } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { type UserPublic, UsersService } from "@/client"
import { AppleButton } from "@/components/ui/AppleButton"
import { AppleDialog, AppleDialogClose, AppleDialogContent, AppleDialogFooter, AppleDialogHeader, AppleDialogTitle, AppleDialogDescription } from "@/components/ui/apple/AppleDialog"
import { AppleDropdownMenuItem } from "@/components/ui/apple/AppleDropdownMenu"
import { LoadingButton } from "@/components/ui/loading-button"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

const formSchema = z
  .object({
    email: z.email({ message: "Invalid email address" }),
    full_name: z.string().optional(),
    password: z
      .string()
      .min(8, { message: "Password must be at least 8 characters" })
      .optional()
      .or(z.literal("")),
    confirm_password: z.string().optional(),
    is_superuser: z.boolean().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((data) => !data.password || data.password === data.confirm_password, {
    message: "The passwords don't match",
    path: ["confirm_password"],
  })

type FormData = z.infer<typeof formSchema>

interface EditUserProps {
  user: UserPublic
  onSuccess: () => void
}

const EditUser = ({ user, onSuccess }: EditUserProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      email: user.email,
      full_name: user.full_name ?? undefined,
      is_superuser: user.is_superuser,
      is_active: user.is_active,
    },
  })

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      UsersService.updateUser({ userId: user.id, requestBody: data }),
    onSuccess: () => {
      showSuccessToast("User updated successfully")
      setIsOpen(false)
      onSuccess()
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] })
    },
  })

  const onSubmit = (data: FormData) => {
    // exclude confirm_password from submission data and remove password if empty
    const { confirm_password: _, ...submitData } = data
    if (!submitData.password) {
      delete submitData.password
    }
    mutation.mutate(submitData)
  }

  return (
    <AppleDialog open={isOpen} onOpenChange={setIsOpen}>
      <AppleDropdownMenuItem
        variant="default"
        onSelect={(e) => e.preventDefault()}
        onClick={() => setIsOpen(true)}
      >
        <Pencil />
        Edit User
      </AppleDropdownMenuItem>
      <AppleDialogContent className="sm:max-w-md">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <AppleDialogHeader>
            <AppleDialogTitle>Edit User</AppleDialogTitle>
            <AppleDialogDescription>
              Update the user details below.
            </AppleDialogDescription>
          </AppleDialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <label className="text-sm font-medium text-apple-text-secondary">
                Email <span className="text-destructive">*</span>
              </label>
              <input
                placeholder="Email"
                type="email"
                className="flex h-11 w-full rounded-xl border border-apple-glass-border/50 bg-apple-glass-bg/70 backdrop-blur-sm px-3.5 py-2.5 text-sm text-apple-text-primary placeholder:text-apple-text-tertiary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/40 focus-visible:border-apple-accent/50 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                {...form.register("email")}
                required
              />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-apple-text-secondary">
                Full Name
              </label>
              <input
                placeholder="Full name"
                type="text"
                className="flex h-11 w-full rounded-xl border border-apple-glass-border/50 bg-apple-glass-bg/70 backdrop-blur-sm px-3.5 py-2.5 text-sm text-apple-text-primary placeholder:text-apple-text-tertiary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/40 focus-visible:border-apple-accent/50 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                {...form.register("full_name")}
              />
              {form.formState.errors.full_name && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.full_name.message}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-apple-text-secondary">
                Set Password
              </label>
              <input
                placeholder="Password"
                type="password"
                className="flex h-11 w-full rounded-xl border border-apple-glass-border/50 bg-apple-glass-bg/70 backdrop-blur-sm px-3.5 py-2.5 text-sm text-apple-text-primary placeholder:text-apple-text-tertiary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/40 focus-visible:border-apple-accent/50 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.password.message}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-apple-text-secondary">
                Confirm Password
              </label>
              <input
                placeholder="Password"
                type="password"
                className="flex h-11 w-full rounded-xl border border-apple-glass-border/50 bg-apple-glass-bg/70 backdrop-blur-sm px-3.5 py-2.5 text-sm text-apple-text-primary placeholder:text-apple-text-tertiary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/40 focus-visible:border-apple-accent/50 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                {...form.register("confirm_password")}
              />
              {form.formState.errors.confirm_password && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.confirm_password.message}</p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                className="rounded border-apple-glass-border/50 bg-apple-glass-bg/70 w-4 h-4"
                checked={form.watch("is_superuser")}
                onChange={(e) => form.setValue("is_superuser", e.target.checked)}
              />
              <label className="text-sm font-medium text-apple-text-secondary">
                Is superuser?
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                className="rounded border-apple-glass-border/50 bg-apple-glass-bg/70 w-4 h-4"
                checked={form.watch("is_active")}
                onChange={(e) => form.setValue("is_active", e.target.checked)}
              />
              <label className="text-sm font-medium text-apple-text-secondary">
                Is active?
              </label>
            </div>
          </div>

          <AppleDialogFooter>
            <AppleDialogClose asChild>
              <AppleButton variant="outline" disabled={mutation.isPending}>
                Cancel
              </AppleButton>
            </AppleDialogClose>
            <LoadingButton type="submit" loading={mutation.isPending}>
              Save
            </LoadingButton>
          </AppleDialogFooter>
        </form>
      </AppleDialogContent>
    </AppleDialog>
  )
}

export default EditUser
