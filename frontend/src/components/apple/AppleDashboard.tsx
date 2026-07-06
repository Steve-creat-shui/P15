import { motion } from "motion/react"

import useAuth from "@/hooks/useAuth"
export function AppleDashboard() {
  const { user: currentUser } = useAuth()

  const userName = currentUser?.full_name || currentUser?.email || "User"
  const greeting = getGreeting()

  return (
    <div className="flex flex-col gap-10">
      {/* Welcome section */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1.0] }}
        className="flex flex-col gap-1"
      >
        <h1 className="text-3xl font-semibold tracking-tight text-apple-text-primary">
          {greeting}，{userName.split(" ")[0] || userName}
        </h1>
        <p className="text-apple-text-secondary">
          Judicial Evidence Visualization System
        </p>
      </motion.div>

      {/* Quick stats */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15, ease: [0.25, 0.1, 0.25, 1.0] }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        <QuickStatCard
          label="案件总数"
          value="--"
          description="已创建案件"
        />
        <QuickStatCard
          label="证据条目"
          value="--"
          description="已提取证据"
        />
        <QuickStatCard
          label="生成图片"
          value="--"
          description="可视化成果"
        />
      </motion.div>
    </div>
  )
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return "夜深了"
  if (hour < 12) return "早上好"
  if (hour < 18) return "下午好"
  return "晚上好"
}

interface QuickStatCardProps {
  label: string
  value: string
  description: string
}

function QuickStatCard({ label, value, description }: QuickStatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1.0] }}
    >
      <div className="flex flex-col gap-2 rounded-2xl border border-apple-glass-border/40 bg-apple-glass-bg/70 backdrop-blur-xl p-5 shadow-[var(--apple-glass-shadow)] transition-all duration-300 hover:shadow-[var(--apple-glass-shadow-lg)] hover:-translate-y-0.5">
        <p className="text-xs font-medium text-apple-text-tertiary uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-semibold tracking-tight text-apple-text-primary">{value}</p>
        <p className="text-xs text-apple-text-tertiary">{description}</p>
      </div>
    </motion.div>
  )
}
