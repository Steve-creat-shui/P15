import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight, Clock, FileText, Image, Scale } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  pending: { label: "待处理", color: "bg-gray-100 text-gray-700" },
  extracted: { label: "已提取", color: "bg-blue-100 text-blue-700" },
  reviewed: { label: "已审核", color: "bg-amber-100 text-amber-700" },
  generated: { label: "已生成", color: "bg-green-100 text-green-700" },
}

export const Route = createFileRoute("/_layout/cases/")({
  component: CaseList,
  head: () => ({
    meta: [{ title: "案件列表 - JEVS" }],
  }),
})

function CaseList() {
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
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-8 text-center text-sm text-destructive">
        {error}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Scale className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">JEVS 案件列表</h1>
            <p className="text-muted-foreground">所有已创建的案件及分析进度</p>
          </div>
        </div>
        <Button asChild>
          <Link to="/cases/new">新建案件</Link>
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <Scale className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-muted-foreground">暂无案件记录</p>
            <Button asChild>
              <Link to="/cases/new">创建第一个案件</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              to="/cases/$caseId/evidence"
              params={{ caseId: String(p.id) }}
              className="block"
            >
              <Card className="transition-colors hover:bg-accent/50">
                <CardContent className="flex items-center gap-6 py-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold truncate">
                      {p.title}
                    </h3>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
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
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      STATUS_MAP[p.status]?.color ?? "bg-gray-100"
                    }`}
                  >
                    {STATUS_MAP[p.status]?.label ?? p.status}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                </CardContent>
              </Card>
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
