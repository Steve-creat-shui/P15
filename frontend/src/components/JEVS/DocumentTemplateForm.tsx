import { Download, FileText, Loader2, MessageSquare, NotebookPen } from "lucide-react"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// ==============================================================================
// Types
// ==============================================================================

interface ChatMsg {
  sender: string
  text: string
  time: string
}

interface GeneratedImage {
  id?: number
  image_type?: string
  image_path: string
  provider?: string
  style?: string
}

interface DocumentTemplateFormProps {
  evidenceId: number
  caseId: number
  onSuccess: (image: GeneratedImage) => void
}

type TemplateType = "grid_paper" | "a4_document" | "chat_screenshot"

const TEMPLATES: { type: TemplateType; label: string; description: string; icon: typeof FileText }[] = [
  { type: "grid_paper", label: "格子纸", description: "手写笔记、便条、协议等", icon: NotebookPen },
  { type: "a4_document", label: "A4 打印文件", description: "合同、欠条、正式文件、证明", icon: FileText },
  { type: "chat_screenshot", label: "聊天截图", description: "微信/短信聊天记录", icon: MessageSquare },
]

const IMAGE_PATH_PREFIX = "/api/v1/static/images/"

function docImageUrl(path: string): string {
  if (!path) return ""
  if (path.startsWith("http")) return path
  return IMAGE_PATH_PREFIX + path.replace(/^.*static\/images\//, "")
}

// ==============================================================================
// Component
// ==============================================================================

export function DocumentTemplateForm({ evidenceId, caseId, onSuccess }: DocumentTemplateFormProps) {
  const [templateType, setTemplateType] = useState<TemplateType | null>(null)
  const [title, setTitle] = useState("")
  const [textContent, setTextContent] = useState("")
  const [documentDate, setDocumentDate] = useState("")
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [generating, setGenerating] = useState(false)
  const [resultImage, setResultImage] = useState<GeneratedImage | null>(null)
  const [error, setError] = useState("")

  // ---- Chat message form ----
  const [msgSender, setMsgSender] = useState("A")
  const [msgText, setMsgText] = useState("")
  const [msgTime, setMsgTime] = useState("14:00")

  const addMessage = () => {
    if (!msgText.trim()) return
    setMessages((prev) => [
      ...prev,
      { sender: msgSender, text: msgText.trim(), time: msgTime },
    ])
    setMsgText("")
    setMsgTime("14:00")
  }

  const removeMessage = (idx: number) => {
    setMessages((prev) => prev.filter((_, i) => i !== idx))
  }

  // ---- Submit ----
  const handleGenerate = async () => {
    setGenerating(true)
    setError("")
    try {
      const body: Record<string, unknown> = {
        evidence_id: evidenceId,
        template_type: templateType,
        title,
        text_content: textContent,
        document_date: documentDate,
        messages,
      }
      const res = await fetch(`/api/v1/evidence/${evidenceId}/render-document`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { detail?: string }).detail || res.statusText)
      }
      const img = (await res.json()) as GeneratedImage
      setResultImage(img)
      onSuccess(img)
    } catch (err) {
      setError(err instanceof Error ? err.message : "渲染失败")
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">书证渲染</span>
        <Badge variant="secondary" className="text-xs">
          0 API 调用 · 本地 Pillow 渲染
        </Badge>
      </div>

      {/* Step 1: Template selection */}
      {!templateType ? (
        <div>
          <Label className="text-xs text-muted-foreground mb-2 block">
            选择书证模板
          </Label>
          <div className="grid grid-cols-3 gap-3">
            {TEMPLATES.map((tmpl) => {
              const Icon = tmpl.icon
              return (
                <Card
                  key={tmpl.type}
                  className="cursor-pointer border-dashed hover:border-primary hover:bg-accent/50 transition-colors"
                  onClick={() => setTemplateType(tmpl.type)}
                >
                  <CardContent className="flex flex-col items-center gap-2 py-4 text-center">
                    <Icon className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{tmpl.label}</p>
                      <p className="text-xs text-muted-foreground">{tmpl.description}</p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      ) : (
        /* Step 2: Dynamic form */
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setTemplateType(null)}>
              ← 更换模板
            </Button>
            <span className="text-sm font-medium">
              {TEMPLATES.find((t) => t.type === templateType)?.label}
            </span>
          </div>

          {/* Common: title */}
          {templateType !== "chat_screenshot" && (
            <div className="space-y-1.5">
              <Label className="text-xs">标题（选填）</Label>
              <Input
                placeholder="如：借款合同"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          )}

          {/* Common: text area */}
          {templateType !== "chat_screenshot" && (
            <div className="space-y-1.5">
              <Label className="text-xs">
                正文 <span className="text-red-500">*</span>
              </Label>
              <textarea
                rows={6}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="请粘贴原始书证文字，系统将100%原文渲染，不做任何修改"
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
              />
            </div>
          )}

          {/* A4: date */}
          {templateType === "a4_document" && (
            <div className="space-y-1.5">
              <Label className="text-xs">日期（选填）</Label>
              <Input
                placeholder="如：2024年1月15日"
                value={documentDate}
                onChange={(e) => setDocumentDate(e.target.value)}
              />
            </div>
          )}

          {/* Chat: message editor */}
          {templateType === "chat_screenshot" && (
            <div className="space-y-3">
              <Label className="text-xs">
                消息列表 <span className="text-red-500">*</span>
              </Label>

              {/* Existing messages */}
              {messages.length > 0 && (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {messages.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded border px-3 py-1.5 text-xs"
                    >
                      <span className="text-muted-foreground w-8 shrink-0">
                        {m.sender === "A" ? "对方" : "我方"}
                      </span>
                      <span className="flex-1 truncate">{m.text}</span>
                      <span className="text-muted-foreground">{m.time}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-destructive shrink-0"
                        onClick={() => removeMessage(i)}
                      >
                        ✕
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add message form */}
              <div className="flex items-end gap-2 rounded border bg-muted/30 p-3">
                <div className="w-20 space-y-1">
                  <Select value={msgSender} onValueChange={setMsgSender}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">对方</SelectItem>
                      <SelectItem value="B">我方</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-1">
                  <Input
                    className="h-8 text-xs"
                    placeholder="消息内容"
                    value={msgText}
                    onChange={(e) => setMsgText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addMessage()}
                  />
                </div>
                <div className="w-16 space-y-1">
                  <Input
                    className="h-8 text-xs"
                    placeholder="14:30"
                    value={msgTime}
                    onChange={(e) => setMsgTime(e.target.value)}
                  />
                </div>
                <Button size="sm" variant="outline" className="h-8" onClick={addMessage}>
                  添加
                </Button>
              </div>
            </div>
          )}

          {/* Warning */}
          <p className="text-xs text-red-500">
            ⚠️ 本系统不修改任何文字内容，原文渲染
          </p>

          {/* Action */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleGenerate}
              disabled={generating || (templateType === "chat_screenshot" ? messages.length === 0 : !textContent.trim())}
            >
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  渲染中...
                </>
              ) : (
                "生成书证图片"
              )}
            </Button>
            {error && (
              <span className="text-xs text-destructive">{error}</span>
            )}
          </div>

          {/* Result preview */}
          {resultImage && (
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground mb-2">渲染结果：</p>
              <img
                src={docImageUrl(resultImage.image_path)}
                alt="书证渲染结果"
                className="w-full max-h-64 rounded border object-contain"
              />
              <div className="mt-2 flex justify-end">
                <Button size="sm" variant="outline" asChild>
                  <a
                    href={docImageUrl(resultImage.image_path)}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download className="mr-1 h-3.5 w-3.5" />
                    下载
                  </a>
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default DocumentTemplateForm
