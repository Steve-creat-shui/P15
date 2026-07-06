import { createFileRoute } from "@tanstack/react-router"

import ChangePassword from "@/components/UserSettings/ChangePassword"
import DeleteAccount from "@/components/UserSettings/DeleteAccount"
import UserInformation from "@/components/UserSettings/UserInformation"
import { AppleTabs, AppleTabsContent, AppleTabsList, AppleTabsTrigger } from "@/components/ui/apple/AppleTabs"
import { GlassCard } from "@/components/ui/GlassCard"
import useAuth from "@/hooks/useAuth"

const tabsConfig = [
  { value: "my-profile", title: "My profile", component: UserInformation },
  { value: "password", title: "Password", component: ChangePassword },
  { value: "danger-zone", title: "Danger zone", component: DeleteAccount },
]

export const Route = createFileRoute("/_layout/settings")({
  component: UserSettings,
  head: () => ({
    meta: [
      {
        title: "Settings - JEVS",
      },
    ],
  }),
})

function UserSettings() {
  const { user: currentUser } = useAuth()
  const finalTabs = currentUser?.is_superuser
    ? tabsConfig.slice(0, 3)
    : tabsConfig

  if (!currentUser) {
    return null
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-apple-text-primary">User Settings</h1>
        <p className="text-apple-text-secondary mt-1">
          Manage your account settings and preferences
        </p>
      </div>

      <AppleTabs defaultValue="my-profile">
        <AppleTabsList>
          {finalTabs.map((tab) => (
            <AppleTabsTrigger key={tab.value} value={tab.value}>
              {tab.title}
            </AppleTabsTrigger>
          ))}
        </AppleTabsList>
        {finalTabs.map((tab) => (
          <AppleTabsContent key={tab.value} value={tab.value}>
            <GlassCard>
              <div className="p-6">
                <tab.component />
              </div>
            </GlassCard>
          </AppleTabsContent>
        ))}
      </AppleTabs>
    </div>
  )
}
