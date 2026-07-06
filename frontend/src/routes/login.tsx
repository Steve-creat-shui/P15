import { zodResolver } from "@hookform/resolvers/zod"
import {
  createFileRoute,
  Link as RouterLink,
  redirect,
} from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { AppleAuthLayout } from "@/components/ui/AppleAuthLayout"
import { AppleInput } from "@/components/ui/AppleInput"
import { ApplePasswordInput } from "@/components/ui/apple/ApplePasswordInput"
import { AppleLoadingButton } from "@/components/ui/apple/AppleLoadingButton"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import useAuth, { isLoggedIn } from "@/hooks/useAuth"

const formSchema = z.object({
  username: z.email(),
  password: z
    .string()
    .min(1, { message: "Password is required" })
    .min(8, { message: "Password must be at least 8 characters" }),
}) satisfies z.ZodType<AccessToken>

type AccessToken = Record<string, unknown>
type FormData = z.infer<typeof formSchema>

export const Route = createFileRoute("/login")({
  component: Login,
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
        title: "Log In - JEVS",
      },
    ],
  }),
})

function Login() {
  const { loginMutation } = useAuth()
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      username: "",
      password: "",
    },
  })

  const onSubmit = (data: FormData) => {
    if (loginMutation.isPending) return
    loginMutation.mutate(data)
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
              Log in
            </h1>
            <p className="text-sm text-apple-text-secondary">
              Judicial Evidence Visualization System
            </p>
          </div>

          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="username"
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
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-apple-text-secondary">Password</FormLabel>
                    <RouterLink
                      to="/recover-password"
                      className="text-xs text-apple-accent hover:underline underline-offset-4"
                    >
                      Forgot your password?
                    </RouterLink>
                  </div>
                  <FormControl>
                    <ApplePasswordInput
                      data-testid="password-input"
                      placeholder="Password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <AppleLoadingButton type="submit" loading={loginMutation.isPending}>
              Log In
            </AppleLoadingButton>
          </div>

          <div className="text-center text-sm text-apple-text-secondary">
            Don&apos;t have an account yet?{" "}
            <RouterLink to="/signup" className="text-apple-accent hover:underline underline-offset-4">
              Sign up
            </RouterLink>
          </div>
        </form>
      </Form>
    </AppleAuthLayout>
  )
}
