import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Check, ChevronDown, Eye, EyeOff, ImageIcon, Palette, Settings2 } from "lucide-react"
import { useEffect, useState } from "react"
import { motion } from "motion/react"

import { jevx, loadModelConfig, saveModelConfig, type ModelsConfig } from "@/lib/jevx"
import { THEMES, useTheme } from "@/hooks/useTheme"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
  head: () => ({
    meta: [{ title: "Dashboard - JEVS" }],
  }),
})

const TEXT_MODELS = [
  { value: "deepseek", label: "DeepSeek（推荐）" },
  { value: "openai", label: "OpenAI GPT" },
  { value: "agnes", label: "Agnes" },
]

const IMAGE_MODELS = [
  { value: "zenmux", label: "ZenMux GPT-Image-2（最新）" },
  { value: "agnes", label: "Agnes Image 2.1 Flash" },
  { value: "dalle", label: "DALL·E 3" },
  { value: "flux", label: "Flux" },
  { value: "hunyuan", label: "混元" },
  { value: "seedream", label: "Seedream" },
]

function getApiKey(modelType: string): string {
  return localStorage.getItem(`jevs-apikey-${modelType}`) || ""
}

function saveApiKey(modelType: string, key: string) {
  if (key) {
    localStorage.setItem(`jevs-apikey-${modelType}`, key)
  } else {
    localStorage.removeItem(`jevs-apikey-${modelType}`)
  }
}

export function Dashboard() {
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()
  const { setTheme, currentTheme } = useTheme()

  const userName = currentUser?.full_name || currentUser?.email || "User"
  const greeting = getGreeting()

  const [cases, setCases] = useState<Array<{ id: number; title: string }>>([])

  const [modelConfig, setModelConfig] = useState<ModelsConfig>(loadModelConfig)

  const [textApiKey, setTextApiKey] = useState(() => getApiKey(modelConfig.text))
  const [imageApiKey, setImageApiKey] = useState(() => getApiKey(modelConfig.image))
  const [showTextKey, setShowTextKey] = useState(false)
  const [showImageKey, setShowImageKey] = useState(false)

  const [cardOpen, setCardOpen] = useState({ report: false, theme: true, model: true })

  useEffect(() => {
    jevx.getProjects().then(data => {
      const list = Array.isArray(data) ? data : (data as { data?: unknown[] }).data || []
      setCases(list.map((c: { id: number; title: string }) => ({ id: c.id, title: c.title })))
    }).catch(() => {})
  }, [])

  const handleSetModel = (type: "text" | "image", value: string) => {
    const newConfig = { ...modelConfig, [type]: value }
    setModelConfig(newConfig)
    saveModelConfig(newConfig)
    if (type === "text") {
      setTextApiKey(getApiKey(value))
    } else {
      setImageApiKey(getApiKey(value))
    }
  }

  const handleSaveConfig = () => {
    saveApiKey(modelConfig.text, textApiKey)
    saveApiKey(modelConfig.image, imageApiKey)
    alert("配置已保存！")
  }

  return (
    <div className="flex flex-col gap-10">
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

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15, ease: [0.25, 0.1, 0.25, 1.0] }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        {/* Card 1: 分析报告 */}
        <DashboardCard icon={<Settings2 className="h-5 w-5" />} title="分析报告" collapsed={cardOpen.report} onToggle={() => setCardOpen(prev => ({ ...prev, report: !prev.report }))}>
          <div className="space-y-2">
            <p className="text-xs text-apple-text-secondary">
              选择案件进入可视化流程，选取已生成的图片，导出分析报告。
            </p>
            {cases.length === 0 ? (
              <p className="text-xs text-apple-text-tertiary py-2">暂无案件，请先创建案件</p>
            ) : (
              <div className="flex flex-col gap-1 max-h-[160px] overflow-y-auto">
                {cases.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => navigate({ to: "/cases/$caseId/generate", params: { caseId: String(c.id) } })}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-apple-text-primary hover:bg-apple-glass-bg-hover/60 transition-colors"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-apple-accent flex-shrink-0" />
                    <span className="truncate">{c.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DashboardCard>

        {/* Card 2: 背景配色 */}
        <DashboardCard icon={<Palette className="h-5 w-5" />} title="背景配色" collapsed={cardOpen.theme} onToggle={() => setCardOpen(prev => ({ ...prev, theme: !prev.theme }))}>
          <div className="flex flex-col gap-3">
            {THEMES.map((theme) => (
              <button
                key={theme.key}
                onClick={() => setTheme(theme.key)}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2 transition-all duration-200 ${
                  currentTheme === theme.key
                    ? "bg-apple-accent/15 ring-1 ring-apple-accent/30"
                    : "hover:bg-apple-glass-bg-hover/60"
                }`}
              >
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 ${
                    theme.key === "warm"
                      ? "bg-gradient-to-br from-[#F5E6D3] via-[#F0DCC8] to-[#E8C4A0]"
                      : theme.key === "cool"
                        ? "bg-gradient-to-br from-[#0D47A1] via-[#00838F] to-[#01579B]"
                        : "bg-gradient-to-br from-[oklch(0.62_0.20_280)] to-[oklch(0.68_0.18_310)]"
                  }`}
                >
                  <div className={`h-3 w-3 rounded-full ${currentTheme === theme.key ? "bg-white" : "bg-white/40"}`} />
                </div>
                <span className={`text-sm font-medium transition-colors ${
                  currentTheme === theme.key ? "text-apple-accent" : "text-apple-text-primary"
                }`}>
                  {theme.label}
                </span>
              </button>
            ))}
          </div>
        </DashboardCard>

        {/* Card 3: 大模型配置 */}
        <DashboardCard icon={<ImageIcon className="h-5 w-5" />} title="大模型配置" collapsed={cardOpen.model} onToggle={() => setCardOpen(prev => ({ ...prev, model: !prev.model }))}>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5 text-apple-text-tertiary" />
                <label className="text-xs font-medium text-apple-text-secondary">文档提取模型</label>
              </div>
              <select
                value={modelConfig.text}
                onChange={(e) => handleSetModel("text", e.target.value)}
                className="flex h-9 w-full rounded-xl border border-apple-glass-border/50 bg-apple-glass-bg/70 backdrop-blur-sm px-3 py-2 text-sm text-apple-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/40 focus-visible:border-apple-accent/50 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 appearance-none cursor-pointer"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='%239ca3af' viewBox='0 0 16 16'%3E%3Cpath d='M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", paddingRight: "30px" }}
              >
                {TEXT_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <div className="relative">
                <input
                  type={showTextKey ? "text" : "password"}
                  value={textApiKey}
                  onChange={(e) => setTextApiKey(e.target.value)}
                  placeholder="API Key"
                  className="w-full h-8 rounded-lg border border-apple-glass-border/50 bg-apple-glass-bg/70 backdrop-blur-sm px-2.5 pr-8 text-xs text-apple-text-primary placeholder:text-apple-text-tertiary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/40 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowTextKey(!showTextKey)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-apple-text-tertiary hover:text-apple-text-primary transition-colors"
                >
                  {showTextKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5 text-apple-text-tertiary" />
                <label className="text-xs font-medium text-apple-text-secondary">图片生成模型</label>
              </div>
              <select
                value={modelConfig.image}
                onChange={(e) => handleSetModel("image", e.target.value)}
                className="flex h-9 w-full rounded-xl border border-apple-glass-border/50 bg-apple-glass-bg/70 backdrop-blur-sm px-3 py-2 text-sm text-apple-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/40 focus-visible:border-apple-accent/50 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 appearance-none cursor-pointer"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='%239ca3af' viewBox='0 0 16 16'%3E%3Cpath d='M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", paddingRight: "30px" }}
              >
                {IMAGE_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <div className="relative">
                <input
                  type={showImageKey ? "text" : "password"}
                  value={imageApiKey}
                  onChange={(e) => setImageApiKey(e.target.value)}
                  placeholder="API Key"
                  className="w-full h-8 rounded-lg border border-apple-glass-border/50 bg-apple-glass-bg/70 backdrop-blur-sm px-2.5 pr-8 text-xs text-apple-text-primary placeholder:text-apple-text-tertiary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/40 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowImageKey(!showImageKey)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-apple-text-tertiary hover:text-apple-text-primary transition-colors"
                >
                  {showImageKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSaveConfig}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-white/80 backdrop-blur-md px-4 py-3 text-sm font-semibold text-slate-800 border border-orange-200/60 shadow-sm hover:bg-white hover:border-orange-300/80 hover:shadow-md hover:shadow-orange-200/40 active:scale-[0.98] transition-all duration-150"
            >
              <Check className="h-4 w-4 text-orange-500" strokeWidth={2.5} />
              保存配置
            </button>
          </div>
        </DashboardCard>
      </motion.div>
    </div>
  )
}

interface DashboardCardProps {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
  collapsed: boolean
  onToggle: () => void
}

function DashboardCard({ icon, title, children, collapsed, onToggle }: DashboardCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1.0] }}
    >
      <div className="flex flex-col rounded-2xl border border-apple-glass-border/40 bg-apple-glass-bg/70 backdrop-blur-xl p-5 shadow-[var(--apple-glass-shadow)] transition-all duration-300 hover:shadow-[var(--apple-glass-shadow-lg)] hover:-translate-y-0.5">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-2 w-full text-left"
        >
          <span className="text-apple-accent">{icon}</span>
          <p className="text-sm font-semibold tracking-tight text-apple-text-primary flex-1">{title}</p>
          <ChevronDown className={`h-4 w-4 text-apple-text-tertiary transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`} />
        </button>
        {collapsed && <div className="pt-3">{children}</div>}
      </div>
    </motion.div>
  )
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return "夜深了"
  if (hour < 12) return "早上好"
  if (hour < 18) return "下午好"
  return "晚上好"
}
