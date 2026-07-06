import { Download, Loader2, ZoomIn } from "lucide-react"
import { useState } from "react"

import { GlassCard } from "@/components/ui/GlassCard"
import { AppleButton } from "@/components/ui/AppleButton"
import { AppleBadge } from "@/components/ui/apple/AppleBadge"
import { jevx, getGlobalImageModel } from "@/lib/jevx"

const BODY_PARTS = [
  "头部", "脸部", "颈部",
  "左肩", "右肩", "左上臂", "右上臂", "左手臂", "右手臂",
  "左肘", "右肘", "左前臂", "右前臂",
  "左手", "右手",
  "胸部", "腹部",
  "左腰", "右腰",
  "左大腿", "右大腿", "左膝", "右膝",
  "左小腿", "右小腿",
  "左脚", "右脚",
  "背部", "躯干",
] as const

interface GeneratedImage {
  id?: number
  image_type?: string
  image_path: string
  provider?: string
}

interface InjuryCloseupFormProps {
  evidenceId: number
  caseId: number
  defaultDescription: string
  onSuccess: (image: GeneratedImage) => void
}

const IMAGE_PATH_PREFIX = "/api/v1/static/images/"

function injuryImageUrl(path: string): string {
  if (!path) return ""
  if (path.startsWith("http")) return path
  return IMAGE_PATH_PREFIX + path.replace(/^.*static\/images\//, "")
}

export function InjuryCloseupForm({
  evidenceId,
  caseId: _caseId,
  defaultDescription,
  onSuccess,
}: InjuryCloseupFormProps) {
  const [bodyPart, setBodyPart] = useState("")
  const [gender, setGender] = useState<"auto" | "male" | "female">("auto")
  const [injuryDescription, setInjuryDescription] = useState(defaultDescription)
  const [generating, setGenerating] = useState(false)
  const [resultImage, setResultImage] = useState<GeneratedImage | null>(null)
  const [error, setError] = useState("")

  const handleGenerate = async () => {
    if (!bodyPart) {
      setError("请选择受伤部位")
      return
    }
    setGenerating(true)
    setError("")
    try {
      const img = await jevx.generateInjuryCloseup(evidenceId, {
        body_part: bodyPart,
        injury_description: injuryDescription,
        gender: gender === "auto" ? undefined : gender,
        provider_config: {
          scene_overview: getGlobalImageModel(),
          evidence_closeup: getGlobalImageModel(),
          document_render: "pillow",
        },
      })
      setResultImage(img as unknown as GeneratedImage)
      onSuccess(img as unknown as GeneratedImage)
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败")
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
        <ZoomIn className="h-4 w-4 text-apple-text-tertiary" />
        <span className="text-sm font-medium">AI 伤情特写</span>
        <AppleBadge variant="accent" className="text-xs">
          AI 生成
        </AppleBadge>
      </div>

      <div className="space-y-3">
        {/* Gender selector */}
        <div className="space-y-1.5">
          <label className="text-xs text-apple-text-secondary">
            性别 <span className="text-apple-text-tertiary">（确保人物特征一致）</span>
          </label>
          <div className="flex gap-2">
            {[
              { value: "auto", label: "自动推断" },
              { value: "male", label: "男性" },
              { value: "female", label: "女性" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setGender(opt.value as "auto" | "male" | "female")}
                className={
                  "flex-1 h-9 rounded-xl text-xs font-medium transition-all duration-200 " +
                  (gender === opt.value
                    ? "bg-apple-accent text-white shadow-sm"
                    : "border border-apple-glass-border/50 bg-apple-glass-bg/70 text-apple-text-secondary hover:bg-apple-glass-bg")
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body part selector */}
        <div className="space-y-1.5">
          <label className="text-xs text-apple-text-secondary">
            受伤部位 <span className="text-destructive">*</span>
          </label>
          <select
            className={inputClass}
            value={bodyPart}
            onChange={(e) => setBodyPart(e.target.value)}
          >
            <option value="">请选择受伤部位</option>
            {BODY_PARTS.map((part) => (
              <option key={part} value={part}>
                {part}
              </option>
            ))}
          </select>
        </div>

        {/* Injury description */}
        <div className="space-y-1.5">
          <label className="text-xs text-apple-text-secondary">
            伤情描述 <span className="text-destructive">*</span>
          </label>
          <textarea
            rows={3}
            className={textareaClass}
            placeholder="如：多处擦挫伤、淤青、抓挠伤痕"
            value={injuryDescription}
            onChange={(e) => setInjuryDescription(e.target.value)}
          />
        </div>

        {/* Generate button */}
        <div className="flex items-center gap-3">
          <AppleButton
            onClick={handleGenerate}
            disabled={generating || !bodyPart || !injuryDescription.trim()}
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                生成中...
              </>
            ) : (
              "生成伤情特写"
            )}
          </AppleButton>
          {error && (
            <span className="text-xs text-destructive">{error}</span>
          )}
        </div>

        {/* Result preview */}
        {resultImage && (
          <GlassCard className="p-3">
            <p className="text-xs text-apple-text-tertiary mb-2">
              生成结果（{bodyPart} — {injuryDescription}）：
            </p>
            <img
              src={injuryImageUrl(resultImage.image_path)}
              alt={`伤情特写: ${bodyPart}`}
              className="w-full max-h-64 rounded-xl border border-apple-glass-border/50 object-contain"
            />
            <div className="mt-2 flex justify-end">
              <AppleButton size="sm" variant="outline">
                <a
                  href={injuryImageUrl(resultImage.image_path)}
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
    </GlassCard>
  )
}

export default InjuryCloseupForm
