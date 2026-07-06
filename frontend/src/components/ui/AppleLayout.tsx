import { Outlet } from "@tanstack/react-router"
import { motion } from "motion/react"

import { Footer } from "@/components/Common/Footer"
import AppSidebar from "@/components/Sidebar/AppSidebar"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { ThemeProvider } from "@/hooks/useTheme"

/**
 * Apple-style enhanced layout with glass header and page transitions.
 * Wraps the authenticated layout content with Apple aesthetic touches.
 */
export function AppleLayout() {
  return (
    <ThemeProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          {/* Apple-style warm glass header */}
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-apple-glass-border/40 bg-apple-glass-bg/70 backdrop-blur-xl px-6 shadow-[inset_0_1px_0_0_var(--apple-glass-highlight)]">
            <SidebarTrigger className="-ml-1 text-apple-text-tertiary transition-colors hover:text-apple-text-primary" />
          </header>

          {/* Main content with subtle tinted background and ambient glow */}
          <main className="relative flex-1 p-8 md:p-12 overflow-hidden bg-apple-bg">
            {/* Ambient glow layers — colors set by CSS variables from theme */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full opacity-[0.18]" style={{ background: 'radial-gradient(circle, var(--apple-glow-1, oklch(0.62 0.20 280 / 60%)) 0%, transparent 70%)' }} />
              <div className="absolute -bottom-32 -left-32 w-[500px] h-[500px] rounded-full opacity-[0.15]" style={{ background: 'radial-gradient(circle, var(--apple-glow-2, oklch(0.68 0.18 310 / 60%)) 0%, transparent 70%)' }} />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full opacity-[0.10]" style={{ background: 'radial-gradient(circle, var(--apple-glow-3, oklch(0.55 0.17 295 / 50%)) 0%, transparent 65%)' }} />
            </div>
            <div className="relative mx-auto max-w-5xl">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1.0] }}
                className="page-enter"
              >
                <Outlet />
              </motion.div>
            </div>
          </main>

          <Footer />
        </SidebarInset>
      </SidebarProvider>
    </ThemeProvider>
  )
}

export default AppleLayout
