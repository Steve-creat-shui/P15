import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { FileUp, Loader2, Scale } from "lucide-react"
import { useRef, useState } from "react"

import { AppleButton } from "@/components/ui/AppleButton"
import { GlassCard } from "@/components/ui/GlassCard"
import { jevx } from "@/lib/jevx"

export const Route = createFileRoute("/_layout/cases/new")({
  component: CaseInput,
  head: () => ({
    meta: [{ title: "新建案件 - JEVS" }],
  }),
})

function CaseInput() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState("")
  const [rawText, setRawText] = useState("")
  const [loading, setLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState("")
  const [error, setError] = useState("")

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.split(".").pop()?.toLowerCase()
    if (!["txt", "pdf", "docx"].includes(ext || "")) {
      setError("仅支持 .txt / .pdf / .docx 文件")
      return
    }

    setLoading(true)
    setError("")

    try {
      if (ext === "txt") {
        setLoadingMessage("读取文本文件中...")
        const text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve((reader.result as string) || "")
          reader.onerror = () => reject(new Error("文件读取失败"))
          reader.readAsText(file)
        })
        setRawText((prev) => prev + (prev ? "\n" : "") + text)
        setLoadingMessage("")
        setLoading(false)
        if (!title.trim()) {
          setTitle(file.name.replace(/\.(txt|pdf|docx)$/i, ""))
        }
      } else {
        setLoadingMessage(`正在上传并解析 ${ext.toUpperCase()} 文件...`)
        const caseTitle = title.trim() || file.name.replace(/\.(pdf|docx)$/i, "")
        const caseResult = await jevx.uploadAndCreateCase(file, caseTitle)

        setLoadingMessage("AI 正在分析证据，请稍候...")
        await jevx.extractEvidence(caseResult.id)

        navigate({
          to: "/cases/$caseId/evidence",
          params: { caseId: String(caseResult.id) },
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败，请重试")
      setLoadingMessage("")
      setLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError("请输入案件标题")
      return
    }
    if (!rawText.trim()) {
      setError("请粘贴判决书或案件材料")
      return
    }

    setLoading(true)
    setError("")

    try {
      const caseResult = await jevx.createCase(title.trim(), rawText.trim())
      await jevx.extractEvidence(caseResult.id)
      navigate({
        to: "/cases/$caseId/evidence",
        params: { caseId: String(caseResult.id) },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败，请重试")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Scale className="h-7 w-7 text-apple-accent" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-apple-text-primary">新建案件</h1>
          <p className="text-apple-text-secondary">输入案件材料，AI 自动提取可视化证据</p>
        </div>
      </div>

      <GlassCard>
        <div className="space-y-4 p-6">
          <div className="space-y-1.5">
            <label htmlFor="case-title" className="text-sm font-medium text-apple-text-secondary">
              案件标题
            </label>
            <input
              id="case-title"
              className="flex h-11 w-full rounded-xl border border-apple-glass-border/50 bg-apple-glass-bg/70 backdrop-blur-sm px-3.5 py-2.5 text-sm text-apple-text-primary placeholder:text-apple-text-tertiary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/40 focus-visible:border-apple-accent/50 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="如：张三故意伤害案"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-apple-text-secondary">案件材料</label>
              <span className="text-xs text-apple-text-tertiary">
                本系统只提取可视化客观证据，不推测、不捏造。请粘贴判决书或案件材料。
              </span>
            </div>
            <textarea
              id="case-text"
              className="w-full rounded-xl border border-apple-glass-border/50 bg-apple-glass-bg/70 backdrop-blur-sm px-3.5 py-2.5 text-sm text-apple-text-primary placeholder:text-apple-text-tertiary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/40 focus-visible:border-apple-accent/50 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ minHeight: 400 }}
              placeholder="在此粘贴判决书全文或案件材料文本..."
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>
      </GlassCard>

      <div className="flex items-center gap-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.pdf,.docx"
          className="hidden"
          onChange={handleFileUpload}
        />
        <AppleButton
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
        >
          <FileUp className="mr-2 h-4 w-4" />
          上传文件
        </AppleButton>

        <AppleButton
          onClick={handleSubmit}
          disabled={loading}
          size="lg"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {loadingMessage || "AI 正在分析证据..."}
            </>
          ) : (
            "开始提取证据"
          )}
        </AppleButton>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-3 text-sm text-destructive backdrop-blur-sm">
          {error}
        </div>
      )}
    </div>
  )
}
