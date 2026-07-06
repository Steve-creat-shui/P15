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

const formSchema = z
  .object({
    email: z.email(),
    full_name: z.string().min(1, { message: "Full Name is required" }),
    password: z
      .string()
      .min(1, { message: "Password is required" })
      .min(8, { message: "Password must be at least 8 characters" }),
    confirm_password: z
      .string()
      .min(1, { message: "Password confirmation is required" }),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "The passwords don't match",
    path: ["confirm_password"],
  })

type FormData = z.infer<typeof formSchema>

export const Route = createFileRoute("/signup")({
  component: SignUp,
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
        title: "Sign Up - JEVS",
      },
    ],
  }),
})

function SignUp() {
  const { signUpMutation } = useAuth()
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      email: "",
      full_name: "",
      password: "",
      confirm_password: "",
    },
  })

  const onSubmit = (data: FormData) => {
    if (signUpMutation.isPending) return
    const { confirm_password: _confirm_password, ...submitData } = data
    signUpMutation.mutate(submitData)
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
              Create an account
            </h1>
            <p className="text-sm text-apple-text-secondary">
              Judicial Evidence Visualization System
            </p>
          </div>

          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-apple-text-secondary">Full Name</FormLabel>
                  <FormControl>
                    <AppleInput
                      data-testid="full-name-input"
                      placeholder="User"
                      type="text"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-apple-text-secondary">Password</FormLabel>
                  <FormControl>
                    <ApplePasswordInput
                      data-testid="password-input"
                      placeholder="Password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirm_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-apple-text-secondary">Confirm Password</FormLabel>
                  <FormControl>
                    <ApplePasswordInput
                      data-testid="confirm-password-input"
                      placeholder="Confirm Password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <AppleLoadingButton
              type="submit"
              loading={signUpMutation.isPending}
            >
              Sign Up
            </AppleLoadingButton>
          </div>

          <div className="text-center text-sm text-apple-text-secondary">
            Already have an account?{" "}
            <RouterLink to="/login" className="text-apple-accent hover:underline underline-offset-4">
              Log in
            </RouterLink>
          </div>
        </form>
      </Form>
    </AppleAuthLayout>
  )
}
