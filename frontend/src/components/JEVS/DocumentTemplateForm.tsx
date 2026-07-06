import { Download, FileText, Loader2, MessageSquare, NotebookPen, Sparkles, X } from "lucide-react"
import { useState } from "react"

import { GlassCard } from "@/components/ui/GlassCard"
import { AppleButton } from "@/components/ui/AppleButton"
import { AppleBadge } from "@/components/ui/apple/AppleBadge"
import { jevx } from "@/lib/jevx"

// ==============================================================================
// Types
// ==============================================================================

interface ChatMsg {
  sender: string
  sender_name: string
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
  onClose?: () => void
  /**
   * 不推荐直接锁定模板，传 suggestedTemplate 即可在选择页高亮推荐项。
   * 留作向后兼容：当 defaultTemplate 传入时直接进入对应模板的表单。
   */
  defaultTemplate?: TemplateType
  defaultTitle?: string
  defaultText?: string
  /** 系统基于证据类型/描述建议的模板，只在选择页高亮，用户可切换。 */
  suggestedTemplate?: TemplateType
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
  // Strip any prefix up to and including "static/images/" to get relative path
  const relative = path.replace(/.*[\\/]static[\\/]images[\\/]/, "")
  return IMAGE_PATH_PREFIX + relative
}

// ==============================================================================
// Component
// ==============================================================================

export function DocumentTemplateForm({ evidenceId, caseId: _caseId, onSuccess, onClose, defaultTemplate, defaultTitle, defaultText, suggestedTemplate }: DocumentTemplateFormProps) {
  const [closed, setClosed] = useState(false)
  // 初始模板：优先使用 defaultTemplate（锁定模式，向后兼容），
  // 否则用 suggestedTemplate 但不直接进入表单（让用户先看到选择页），
  // 这样在选择页会用高亮提示用户推荐模板。
  const [templateType, setTemplateType] = useState<TemplateType | null>(defaultTemplate || null)
  const [title, setTitle] = useState(defaultTitle || "")
  const [textContent, setTextContent] = useState(defaultText || "")
  const [documentDate, setDocumentDate] = useState("")
  const [sealText, setSealText] = useState("")
  const [sealSubText, setSealSubText] = useState("")
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [generating, setGenerating] = useState(false)
  const [resultImage, setResultImage] = useState<GeneratedImage | null>(null)
  const [error, setError] = useState("")

  // ---- Chat message form ----
  const [msgSender, setMsgSender] = useState("A")
  const [msgText, setMsgText] = useState("")
  const [msgTime, setMsgTime] = useState("14:00")
  const [partnerName, setPartnerName] = useState("对方")
  const [myName, setMyName] = useState("我方")

  const addMessage = () => {
    if (!msgText.trim()) return
    const name = msgSender === "A" ? partnerName : myName
    setMessages((prev) => [
      ...prev,
      { sender: msgSender, sender_name: name, text: msgText.trim(), time: msgTime },
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
      const img = await jevx.renderDocument(evidenceId, {
        template_type: templateType!,
        title,
        text_content: textContent,
        document_date: documentDate,
        seal_text: sealText,
        seal_sub_text: sealSubText,
        messages,
      })
      const generated = img as unknown as GeneratedImage
      setResultImage(generated)
      onSuccess(generated)
    } catch (err) {
      console.error("[DocumentTemplateForm] render failed:", err)
      setError(err instanceof Error ? err.message : "渲染失败")
    } finally {
      setGenerating(false)
    }
  }

  const inputClass =
    "flex h-9 w-full rounded-xl border border-apple-glass-border/50 bg-apple-glass-bg/70 backdrop-blur-sm px-3 py-2 text-sm text-apple-text-primary placeholder:text-apple-text-tertiary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/40 focus-visible:border-apple-accent/50 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"

  const textareaClass =
    "w-full rounded-xl border border-apple-glass-border/50 bg-apple-glass-bg/70 backdrop-blur-sm px-3 py-2 text-sm text-apple-text-primary placeholder:text-apple-text-tertiary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/40 focus-visible:border-apple-accent/50 transition-all duration-200 resize-y disabled:cursor-not-allowed disabled:opacity-50"

  return (
    <GlassCard className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-apple-text-tertiary" />
        <span className="text-sm font-medium">书证渲染</span>
        <AppleBadge variant="secondary" className="text-xs">
          0 API 调用 · 本地 Pillow 渲染
        </AppleBadge>
        <button
          type="button"
          className="ml-auto text-apple-text-tertiary hover:text-apple-text-primary transition-colors"
          onClick={() => onClose ? onClose() : setClosed(true)}
          title="关闭"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {closed && (
        <p className="text-xs text-apple-text-tertiary">书证渲染表单已关闭</p>
      )}

      {!closed && <>
        {/* Step 1: Template selection */}
      {!templateType ? (
        <div>
          <p className="text-xs text-apple-text-secondary mb-2 block">
            选择书证模板
            {suggestedTemplate && (
              <span className="ml-2 text-apple-accent">
                · 推荐：{TEMPLATES.find((t) => t.type === suggestedTemplate)?.label}
              </span>
            )}
          </p>
          <div className="grid grid-cols-3 gap-3">
            {TEMPLATES.map((tmpl) => {
              const Icon = tmpl.icon
              const isSuggested = tmpl.type === suggestedTemplate
              return (
                <GlassCard
                  key={tmpl.type}
                  hover
                  className={
                    "relative cursor-pointer transition-all " +
                    (isSuggested
                      ? "border-apple-accent/70 bg-apple-accent/5 ring-1 ring-apple-accent/40"
                      : "border-dashed border-apple-glass-border/50 hover:border-apple-accent/40")
                  }
                  onClick={() => setTemplateType(tmpl.type)}
                >
                  {isSuggested && (
                    <div className="absolute -top-2 -right-2">
                      <AppleBadge variant="accent" className="text-[10px] px-1.5 py-0.5 shadow-sm">
                        <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                        推荐
                      </AppleBadge>
                    </div>
                  )}
                  <div className="flex flex-col items-center gap-2 py-4 text-center">
                    <Icon className={"h-8 w-8 " + (isSuggested ? "text-apple-accent" : "text-apple-text-tertiary")} />
                    <div>
                      <p className="text-sm font-medium">{tmpl.label}</p>
                      <p className="text-xs text-apple-text-tertiary">{tmpl.description}</p>
                    </div>
                  </div>
                </GlassCard>
              )
            })}
          </div>
        </div>
      ) : (
        /* Step 2: Dynamic form */
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AppleButton variant="ghost" size="sm" onClick={() => setTemplateType(null)}>
              ← 更换模板
            </AppleButton>
            <span className="text-sm font-medium">
              {TEMPLATES.find((t) => t.type === templateType)?.label}
            </span>
          </div>

          {/* Common: title */}
          {templateType !== "chat_screenshot" && (
            <div className="space-y-1.5">
              <label className="text-xs text-apple-text-secondary">标题（选填）</label>
              <input
                className={inputClass}
                placeholder="如：借款合同"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          )}

          {/* Common: text area */}
          {templateType !== "chat_screenshot" && (
            <div className="space-y-1.5">
              <label className="text-xs text-apple-text-secondary">
                正文 <span className="text-destructive">*</span>
              </label>
              <textarea
                rows={6}
                className={textareaClass}
                placeholder="请粘贴原始书证文字，系统将100%原文渲染，不做任何修改"
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
              />
            </div>
          )}

          {/* A4: date */}
          {templateType === "a4_document" && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs text-apple-text-secondary">日期（选填）</label>
                <input
                  className={inputClass}
                  placeholder="如：2024年1月15日"
                  value={documentDate}
                  onChange={(e) => setDocumentDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-apple-text-secondary">印章文字（选填，如：XX市人民法院）</label>
                <input
                  className={inputClass}
                  placeholder="如：XX市人民法院"
                  value={sealText}
                  onChange={(e) => setSealText(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-apple-text-secondary">印章副文字（选填，如：审、证、专用章）</label>
                <input
                  className={inputClass}
                  placeholder="如：审、证、专用章"
                  value={sealSubText}
                  onChange={(e) => setSealSubText(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Chat: message editor */}
          {templateType === "chat_screenshot" && (
            <div className="space-y-3">
              <label className="text-xs text-apple-text-secondary">
                消息列表 <span className="text-destructive">*</span>
              </label>

              {/* Existing messages */}
              {messages.length > 0 && (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {messages.map((m, i) => (
                    <GlassCard
                      key={i}
                      hover={false}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs"
                    >
                      <span className="text-apple-text-tertiary w-12 shrink-0 truncate">
                        {m.sender === "A" ? m.sender_name : myName}
                      </span>
                      <span className="flex-1 truncate">{m.text}</span>
                      <span className="text-apple-text-tertiary">{m.time}</span>
                      <AppleButton
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 text-destructive shrink-0 p-0"
                        onClick={() => removeMessage(i)}
                      >
                        ✕
                      </AppleButton>
                    </GlassCard>
                  ))}
                </div>
              )}

              {/* Add message form */}
              <div className="rounded-xl border border-apple-glass-border/50 bg-apple-glass-bg/60 backdrop-blur-sm p-3 space-y-2">
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-apple-text-secondary w-16">对方名称</span>
                  <input
                    className={`${inputClass} h-7 text-xs flex-1`}
                    placeholder="默认：对方"
                    value={partnerName}
                    onChange={(e) => setPartnerName(e.target.value)}
                  />
                  <span className="text-apple-text-secondary w-16">我方名称</span>
                  <input
                    className={`${inputClass} h-7 text-xs flex-1`}
                    placeholder="默认：我方"
                    value={myName}
                    onChange={(e) => setMyName(e.target.value)}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <div className="w-20 space-y-1">
                    <select
                      value={msgSender}
                      onChange={e => setMsgSender(e.target.value)}
                      className={`${inputClass} h-8 text-xs`}
                    >
                      <option value="A">对方</option>
                      <option value="B">我方</option>
                    </select>
                  </div>
                  <div className="flex-1 space-y-1">
                    <input
                      className={`${inputClass} h-8 text-xs`}
                      placeholder="消息内容"
                      value={msgText}
                      onChange={(e) => setMsgText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addMessage()}
                    />
                  </div>
                  <div className="w-16 space-y-1">
                    <input
                      className={`${inputClass} h-8 text-xs`}
                      placeholder="14:30"
                      value={msgTime}
                      onChange={(e) => setMsgTime(e.target.value)}
                    />
                  </div>
                  <AppleButton size="sm" variant="outline" className="h-8" onClick={addMessage}>
                    添加
                  </AppleButton>
                </div>
              </div>
            </div>
          )}

          {/* Warning */}
          <p className="text-xs text-apple-text-tertiary">
            ⚠️ 本系统不修改任何文字内容，原文渲染
          </p>

          {/* Action */}
          <div className="flex items-center gap-3">
            <AppleButton
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
            </AppleButton>
            {error && (
              <span className="text-xs text-destructive">{error}</span>
            )}
          </div>

          {/* Result preview */}
          {resultImage && (
            <GlassCard className="p-3">
              <p className="text-xs text-apple-text-tertiary mb-2">渲染结果：</p>
              <img
                src={docImageUrl(resultImage.image_path)}
                alt="书证渲染结果"
                className="w-full max-h-64 rounded-xl border border-apple-glass-border/50 object-contain"
              />
              <div className="mt-2 flex justify-end">
                <AppleButton size="sm" variant="outline">
                  <a
                    href={docImageUrl(resultImage.image_path)}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center"
                  >
                    <Download className="mr-1 h-3.5 w-3.5" />
                    下载
                  </a>
                </AppleButton>
              </div>
            </GlassCard>
          )}
        </div>
      )}
      </>}
    </GlassCard>
  )
}

export default DocumentTemplateForm
