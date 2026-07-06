import { Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"

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

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "待处理", color: "bg-apple-glass-bg text-apple-text-tertiary" },
  extracted: { label: "已提取", color: "bg-apple-accent/10 text-apple-accent" },
  reviewed: { label: "已审核", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  generated: { label: "已生成", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
}

export function AppleCaseList() {
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
      <div className="flex items-center justify-center py-32">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-apple-accent border-t-transparent opacity-40" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive">
        {error}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight text-apple-text-primary">案件列表</h1>
        <p className="text-apple-text-secondary">All cases and analysis progress</p>
      </div>

      {/* Create button */}
      <div className="flex justify-end">
        <Link
          to="/cases/new"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-apple-accent-start to-apple-accent-end px-4 py-2 text-sm font-medium text-white shadow-[0_2px_12px_var(--apple-accent-glow)] transition-all hover:from-apple-accent-hover-start hover:to-apple-accent-hover-end active:scale-[0.98]"
        >
          新建案件
        </Link>
      </div>

      {/* Case list */}
      {projects.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-apple-glass-border/50 bg-apple-glass-bg/30 py-20 text-center">
          <p className="text-apple-text-secondary mb-2">暂无案件记录</p>
          <Link to="/cases/new" className="text-apple-accent p-0 h-auto inline-flex items-center text-sm underline-offset-4 hover:underline">
            创建第一个案件
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {projects.map((p, i) => (
            <Link
              key={p.id}
              to="/cases/$caseId/evidence"
              params={{ caseId: String(p.id) }}
              className="block"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <GlassCard hover elevated className="p-5">
                <div className="flex items-center gap-6">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium tracking-tight text-apple-text-primary truncate">
                      {p.title}
                    </h3>
                    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-apple-text-tertiary">
                      <span>{formatDate(p.created_at)}</span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-1 w-1 rounded-full bg-apple-text-tertiary/50" />
                        {p.evidence_count} 条证据
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-1 w-1 rounded-full bg-apple-text-tertiary/50" />
                        {p.image_count} 张图片
                      </span>
                    </div>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      STATUS_MAP[p.status]?.color ?? "bg-apple-glass-bg text-apple-text-tertiary"
                    }`}
                  >
                    {STATUS_MAP[p.status]?.label ?? p.status}
                  </span>
                </div>
              </GlassCard>
            </Link>
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
