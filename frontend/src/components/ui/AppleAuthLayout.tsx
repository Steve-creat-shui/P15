import { motion } from "motion/react"

import { Footer } from "@/components/Common/Footer"
import { Logo } from "@/components/Common/Logo"

interface AppleAuthLayoutProps {
  children: React.ReactNode
}

/**
 * Apple-style auth layout with gradient left panel and glass form card.
 * Replaces the existing AuthLayout for login/signup/recover/reset pages.
 */
export function AppleAuthLayout({ children }: AppleAuthLayoutProps) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Left panel: subtle gradient */}
      <div className="relative hidden flex-col items-center justify-center overflow-hidden border-r border-apple-glass-border/30 bg-gradient-to-br from-apple-accent-soft via-apple-bg to-white p-12 lg:flex">
        {/* Ambient light blobs */}
        <div
          className="pointer-events-none absolute -top-20 -left-20 h-80 w-80 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--apple-accent-soft) 0%, transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-10 -right-10 h-60 w-60 rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--apple-accent-glow) 0%, transparent 70%)" }}
        />

        <div className="relative z-10 flex flex-col items-center gap-4 text-center">
          <Logo variant="full" className="h-14" asLink={false} />
          <p className="max-w-xs text-sm leading-relaxed text-apple-text-secondary">
            Judicial Evidence Visualization System
          </p>
        </div>
      </div>

      {/* Right panel: glass form card */}
      <div className="flex flex-col items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm">
          {/* Ambient glow behind form */}
          <div
            className="pointer-events-none absolute left-1/2 top-0 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, var(--apple-accent-glow) 0%, transparent 70%)" }}
          />

          <div className="relative">
            <div className="rounded-xl border border-apple-glass-border/40 bg-apple-glass-bg/70 backdrop-blur-xl shadow-[var(--apple-glass-shadow)]">
              <div className="px-6 py-8">
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1.0] }}
                >
                  {children}
                </motion.div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <Footer />
        </div>
      </div>
    </div>
  )
}

export default AppleAuthLayout
