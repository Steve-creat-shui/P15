import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { FileUp, Loader2, Scale } from "lucide-react"
import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

  /** 上传文件并直接创建案件 + 提取证据（PDF/DOCX 走后端解析，TXT 前端读取） */
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
        // TXT: 前端直接读取，填入文本框供用户预览/编辑
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
        // 自动用文件名填充标题
        if (!title.trim()) {
          setTitle(file.name.replace(/\.(txt|pdf|docx)$/i, ""))
        }
      } else {
        // PDF / DOCX: 上传到后端解析，直接创建案件 + 提取证据
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
      // 重置 file input
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  /** 手动粘贴文本后提交 */
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
        <Scale className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">新建案件</h1>
          <p className="text-muted-foreground">输入案件材料，AI 自动提取可视化证据</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">案件信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="case-title">案件标题</Label>
            <Input
              id="case-title"
              placeholder="如：张三故意伤害案"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="case-text">案件材料</Label>
              <span className="text-xs text-muted-foreground">
                本系统只提取可视化客观证据，不推测、不捏造。请粘贴判决书或案件材料。
              </span>
            </div>
            <textarea
              id="case-text"
              rows={18}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ minHeight: 400 }}
              placeholder="在此粘贴判决书全文或案件材料文本..."
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.pdf,.docx"
          className="hidden"
          onChange={handleFileUpload}
        />
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
        >
          <FileUp className="mr-2 h-4 w-4" />
          上传文件（.txt / .pdf / .docx）
        </Button>

        <Button
          onClick={handleSubmit}
          disabled={loading}
          className="ml-auto min-w-[160px]"
          size="lg"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {loadingMessage || "AI 正在分析证据，请稍候..."}
            </>
          ) : (
            "开始提取证据"
          )}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  )
}

// Export via Route only (TanStack Router file-based routing)
