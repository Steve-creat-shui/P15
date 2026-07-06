import { createFileRoute, redirect } from "@tanstack/react-router"

import { AppleLayout } from "@/components/ui/AppleLayout"
import { isLoggedIn } from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout")({
  component: Layout,
  beforeLoad: async () => {
    if (!isLoggedIn()) {
      throw redirect({
        to: "/login",
      })
    }
  },
})

function Layout() {
  return <AppleLayout />
}

export default Layout
