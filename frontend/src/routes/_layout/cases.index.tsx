import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowRight, Clock, FileText, Image, Scale, Trash2 } from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useState } from "react"

import { AppleBadge } from "@/components/ui/apple/AppleBadge"
import { AppleButton } from "@/components/ui/AppleButton"
import { GlassCard } from "@/components/ui/GlassCard"
import { jevx } from "@/lib/jevx"

interface Project {
  id: number
  title: string
  status: string
  created_at: string
  evidence_count: number
  image_count: number
}

const STATUS_MAP: Record<string, { label: string; variant: "secondary" | "accent" | "success" }> = {
  pending: { label: "待处理", variant: "secondary" },
  extracted: { label: "已提取", variant: "accent" },
  reviewed: { label: "已审核", variant: "accent" },
  generated: { label: "已生成", variant: "success" },
}

export const Route = createFileRoute("/_layout/cases/")({
  component: CaseList,
  head: () => ({
    meta: [{ title: "案件列表 - JEVS" }],
  }),
})

function CaseList() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    jevx
      .getProjects()
      .then(setProjects)
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-apple-accent border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-8 text-center text-sm text-destructive backdrop-blur-sm">
        {error}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Scale className="h-7 w-7 text-apple-accent" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-apple-text-primary">案件列表</h1>
            <p className="text-apple-text-secondary">所有已创建的案件及分析进度</p>
          </div>
        </div>
        <AppleButton onClick={() => navigate({ to: "/cases/new" })}>新建案件</AppleButton>
      </div>

      {projects.length === 0 ? (
        <GlassCard className="flex flex-col items-center gap-4 py-16 border-dashed">
          <Scale className="h-12 w-12 text-apple-text-tertiary/40" />
          <p className="text-apple-text-secondary">暂无案件记录</p>
          <AppleButton onClick={() => navigate({ to: "/cases/new" })}>创建第一个案件</AppleButton>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {projects.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="relative group"
            >
              <Link
                to="/cases/$caseId/evidence"
                params={{ caseId: String(p.id) }}
                className="block"
              >
                <GlassCard hover>
                  <div className="flex items-center gap-4 py-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold truncate text-apple-text-primary">
                        {p.title}
                      </h3>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-apple-text-tertiary">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDate(p.created_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5" />
                          {p.evidence_count} 条证据
                        </span>
                        <span className="flex items-center gap-1">
                          <Image className="h-3.5 w-3.5" />
                          {p.image_count} 张图片
                        </span>
                      </div>
                    </div>
                    <AppleBadge variant={STATUS_MAP[p.status]?.variant ?? "secondary"}>
                      {STATUS_MAP[p.status]?.label ?? p.status}
                    </AppleBadge>
                    <ArrowRight className="h-4 w-4 text-apple-text-tertiary/40 shrink-0" />
                  </div>
                </GlassCard>
              </Link>
              <button
                type="button"
                onClick={async (e) => {
                  e.preventDefault()
                  if (!confirm(`确认删除案件「${p.title}」？此操作不可恢复。`)) return
                  try {
                    await jevx.deleteCase(p.id)
                    setProjects(prev => prev.filter(x => x.id !== p.id))
                  } catch (err) {
                    console.error("删除案件失败:", err)
                  }
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-apple-text-tertiary/40 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all"
                title="删除案件"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatDate(iso: string): string {
  if (!iso) return "-"
  const d = new Date(iso)
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}
