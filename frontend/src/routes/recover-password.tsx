import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import {
  createFileRoute,
  Link as RouterLink,
  redirect,
} from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { LoginService } from "@/client"
import { AppleAuthLayout } from "@/components/ui/AppleAuthLayout"
import { AppleInput } from "@/components/ui/AppleInput"
import { AppleLoadingButton } from "@/components/ui/apple/AppleLoadingButton"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { isLoggedIn } from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

const formSchema = z.object({
  email: z.email(),
})

type FormData = z.infer<typeof formSchema>

export const Route = createFileRoute("/recover-password")({
  component: RecoverPassword,
  beforeLoad: async () => {
    if (isLoggedIn()) {
      throw redirect({
        to: "/",
      })
    }
  },
  head: () => ({
    meta: [
      {
        title: "Recover Password - JEVS",
      },
    ],
  }),
})

function RecoverPassword() {
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
    },
  })
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const recoverPassword = async (data: FormData) => {
    await LoginService.recoverPassword({
      email: data.email,
    })
  }

  const mutation = useMutation({
    mutationFn: recoverPassword,
    onSuccess: () => {
      showSuccessToast("Password recovery email sent successfully")
      form.reset()
    },
    onError: handleError.bind(showErrorToast),
  })

  const onSubmit = async (data: FormData) => {
    if (mutation.isPending) return
    mutation.mutate(data)
  }

  return (
    <AppleAuthLayout>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-5"
        >
          <div className="flex flex-col items-center gap-1.5 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-apple-text-primary">
              Password Recovery
            </h1>
            <p className="text-sm text-apple-text-secondary">
              Enter your email to receive a reset link
            </p>
          </div>

          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-apple-text-secondary">Email</FormLabel>
                  <FormControl>
                    <AppleInput
                      data-testid="email-input"
                      placeholder="user@example.com"
                      type="email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <AppleLoadingButton
              type="submit"
              loading={mutation.isPending}
            >
              Continue
            </AppleLoadingButton>
          </div>

          <div className="text-center text-sm text-apple-text-secondary">
            Remember your password?{" "}
            <RouterLink to="/login" className="text-apple-accent hover:underline underline-offset-4">
              Log in
            </RouterLink>
          </div>
        </form>
      </Form>
    </AppleAuthLayout>
  )
}
