import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { type UpdatePassword, UsersService } from "@/client"
import { AppleButton } from "@/components/ui/AppleButton"
import { GlassCard } from "@/components/ui/GlassCard"
import { ApplePasswordInput } from "@/components/ui/apple/ApplePasswordInput"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

const formSchema = z
  .object({
    current_password: z
      .string()
      .min(1, { message: "Password is required" })
      .min(8, { message: "Password must be at least 8 characters" }),
    new_password: z
      .string()
      .min(1, { message: "Password is required" })
      .min(8, { message: "Password must be at least 8 characters" }),
    confirm_password: z
      .string()
      .min(1, { message: "Password confirmation is required" }),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "The passwords don't match",
    path: ["confirm_password"],
  })

type FormData = z.infer<typeof formSchema>

const ChangePassword = () => {
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onSubmit",
    criteriaMode: "all",
    defaultValues: {
      current_password: "",
      new_password: "",
      confirm_password: "",
    },
  })

  const mutation = useMutation({
    mutationFn: (data: UpdatePassword) =>
      UsersService.updatePasswordMe({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("Password updated successfully")
      form.reset()
    },
    onError: handleError.bind(showErrorToast),
  })

  const onSubmit = async (data: FormData) => {
    mutation.mutate(data)
  }

  return (
    <GlassCard>
      <h3 className="text-lg font-semibold py-4 px-6">Change Password</h3>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4 px-6 pb-6"
      >
        <div>
          <label className="text-sm font-medium text-apple-text-secondary">
            Current Password
          </label>
          <ApplePasswordInput
            data-testid="current-password-input"
            placeholder="••••••••"
            className="mt-1.5"
            {...form.register("current_password")}
          />
          {form.formState.errors.current_password && (
            <p className="text-sm text-destructive mt-1">{form.formState.errors.current_password.message}</p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium text-apple-text-secondary">
            New Password
          </label>
          <ApplePasswordInput
            data-testid="new-password-input"
            placeholder="••••••••"
            className="mt-1.5"
            {...form.register("new_password")}
          />
          {form.formState.errors.new_password && (
            <p className="text-sm text-destructive mt-1">{form.formState.errors.new_password.message}</p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium text-apple-text-secondary">
            Confirm Password
          </label>
          <ApplePasswordInput
            data-testid="confirm-password-input"
            placeholder="••••••••"
            className="mt-1.5"
            {...form.register("confirm_password")}
          />
          {form.formState.errors.confirm_password && (
            <p className="text-sm text-destructive mt-1">{form.formState.errors.confirm_password.message}</p>
          )}
        </div>

        <AppleButton
          type="submit"
          className="self-start"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Updating..." : "Update Password"}
        </AppleButton>
      </form>
    </GlassCard>
  )
}

export default ChangePassword
