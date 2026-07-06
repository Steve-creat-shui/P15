import { motion } from "motion/react"

import { AppleButton } from "@/components/ui/AppleButton"
import { AppleInput } from "@/components/ui/AppleInput"
import { AppleUpload } from "@/components/ui/AppleUpload"
import { GlassCard } from "@/components/ui/GlassCard"
import { jevx } from "@/lib/jevx"
import { Loader2 } from "lucide-react"
import { useState } from "react"

const MotionDiv = motion.div

interface AppleCaseNewProps {
  onComplete?: (caseId: number) => void
}

export function AppleCaseNew({ onComplete }: AppleCaseNewProps) {
  const [title, setTitle] = useState("")
  const [rawText, setRawText] = useState("")
  const [loading, setLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState("")
  const [error, setError] = useState("")

  const handleFileUpload = async (file: File) => {
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
        setLoadingMessage(`正在上传并解析 ${(ext || "file").toUpperCase()} 文件...`)
        const caseTitle = title.trim() || file.name.replace(/\.(pdf|docx)$/i, "")
        const caseResult = await jevx.uploadAndCreateCase(file, caseTitle)
        setLoadingMessage("AI 正在分析证据，请稍候...")
        await jevx.extractEvidence(caseResult.id)
        onComplete?.(caseResult.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败，请重试")
      setLoadingMessage("")
      setLoading(false)
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
      onComplete?.(caseResult.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败，请重试")
    } finally {
      setLoading(false)
    }
  }

  const stagger = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: 0.08 * i, ease: [0.25, 0.1, 0.25, 1.0] as const },
  }),
}

  return (
    <div className="flex flex-col gap-10">
      <MotionDiv
        custom={0}
        initial="hidden"
        animate="visible"
        variants={stagger}
        className="space-y-1"
      >
        <h1 className="text-3xl font-semibold tracking-tight text-apple-text-primary">新建案件</h1>
        <p className="text-apple-text-secondary">输入案件材料，AI 自动提取可视化证据</p>
      </MotionDiv>

      <MotionDiv custom={1} initial="hidden" animate="visible" variants={stagger}>
        <GlassCard hover>
          <div className="flex flex-col gap-5 p-6">
            <AppleInput
              id="case-title"
              label="案件标题"
              placeholder="如：张三故意伤害案"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading}
            />

            <div className="space-y-1.5">
              <label htmlFor="case-text" className="text-sm font-medium text-apple-text-secondary">
                案件材料
              </label>
              <textarea
                id="case-text"
                rows={14}
                className="w-full rounded-md border border-apple-glass-border/60 bg-apple-glass-bg/60 backdrop-blur-sm px-3.5 py-2 text-sm text-apple-text-primary placeholder:text-apple-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
                style={{ minHeight: 320 }}
                placeholder="在此粘贴判决书全文或案件材料文本..."
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
        </GlassCard>
      </MotionDiv>

      <MotionDiv custom={2} initial="hidden" animate="visible" variants={stagger}>
        <div className="flex flex-col gap-6">
          <AppleUpload
            onFileSelect={handleFileUpload}
            accept=".txt,.pdf,.docx"
            label="拖放文件到这里"
            description="支持 .txt / .pdf / .docx 格式"
            loading={loading && !rawText}
            progress={loading && !rawText ? 60 : 0}
          />

          <AppleButton onClick={handleSubmit} disabled={loading} size="lg">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {loadingMessage || "处理中..."}
              </>
            ) : (
              "开始提取证据"
            )}
          </AppleButton>
        </div>
      </MotionDiv>

      {error && (
        <MotionDiv
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </MotionDiv>
      )}
    </div>
  )
}
