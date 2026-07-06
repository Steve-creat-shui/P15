import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Home,
  ImageIcon,
  Loader2,
  PenLine,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { AppleBadge } from "@/components/ui/apple/AppleBadge"
import { AppleButton } from "@/components/ui/AppleButton"
import { AppleSelect, AppleSelectContent, AppleSelectItem, AppleSelectTrigger, AppleSelectValue } from "@/components/ui/apple/AppleSelect"
import { Skeleton } from "@/components/ui/skeleton"
import { GlassCard } from "@/components/ui/GlassCard"
import { SceneImageClickPicker } from "@/components/JEVS/SceneImageClickPicker"
import { jevx, getGlobalImageModel, saveModelConfig, loadModelConfig } from "@/lib/jevx"

type EvidenceItem = {
  id: number
  evidence_type: string
  description: string
  location: string | null
  state_json: string | null
  is_approved: boolean
  is_excluded: boolean
  scene_id: number | null
}

// ==============================================================================
// Types
// ==============================================================================

interface ImageRecord {
  id: number
  image_type: string
  image_path: string
  provider?: string
  style?: string
  scene_id?: number | null
  closeup_strategy?: string | null
  reference_preview_path?: string | null
  strategy_used?: string | null
  has_reference_preview?: boolean
}

interface SceneInfo {
  id: number
  name: string
  room_type: string
  evidence_count: number
}

interface CloseupState {
  evidenceId: number
  loading: boolean
  imageId?: number
  imagePath?: string
  error?: string
}

// ==============================================================================
// Constants
// ==============================================================================

const IMAGE_PATH_PREFIX = "/api/v1/static/images/"
const ROOM_TYPE_LABELS: Record<string, string> = {
  bedroom: "卧室",
  living_room: "客厅",
  reception_room: "接待室",
  kitchen: "厨房",
  bathroom: "浴室",
  office: "办公室",
  conference_room: "会议室",
  hallway: "走廊",
  garage: "车库",
  warehouse: "仓库",
  balcony: "阳台",
  outdoor: "户外",
  unknown: "未知",
}

// ==============================================================================
// Helpers
// ==============================================================================

function imageUrl(path: string): string {
  if (!path) return ""
  if (path.startsWith("http")) return path
  return IMAGE_PATH_PREFIX + path.replace(/^.*static\/images\//, "")
}

// ==============================================================================
// Strategy Badge
// ==============================================================================

function StrategyBadge({ strategy }: { strategy: string }) {
  if (strategy === "crop") {
    return (
      <AppleBadge variant="success" className="px-2 py-0.5 text-xs">
        裁剪法 · 背景100%一致
      </AppleBadge>
    )
  }
  if (strategy === "background_inpaint") {
    return (
      <AppleBadge variant="accent" className="px-2 py-0.5 text-xs">
        场景背景+AI物证 · 背景100%匹配
      </AppleBadge>
    )
  }
  return (
    <AppleBadge variant="secondary" className="px-2 py-0.5 text-xs">
      AI生成 · 背景相似
    </AppleBadge>
  )
}

// ==============================================================================
// Component
// ==============================================================================

export const Route = createFileRoute("/_layout/cases/$caseId/generate")({
  component: ImageGenerate,
  head: () => ({
    meta: [{ title: "图片生成 - JEVS" }],
  }),
})

function ImageGenerate() {
  const { caseId } = useParams({ from: "/_layout/cases/$caseId/generate" })
  const [caseTitle, setCaseTitle] = useState("")
  const defaultModel = getGlobalImageModel()
  const [sceneProvider, setSceneProvider] = useState(defaultModel)           // pending selection
  const [closeupProvider, setCloseupProvider] = useState(defaultModel)       // pending selection
  const [appliedSceneProvider, setAppliedSceneProvider] = useState(defaultModel)    // confirmed
  const [appliedCloseupProvider, setAppliedCloseupProvider] = useState(defaultModel) // confirmed

  const modelConfigDirty = sceneProvider !== appliedSceneProvider || closeupProvider !== appliedCloseupProvider

  function applyModelConfig() {
    setAppliedSceneProvider(sceneProvider)
    setAppliedCloseupProvider(closeupProvider)
    saveModelConfig({ text: loadModelConfig().text, image: sceneProvider })
  }

  function cancelModelConfig() {
    setSceneProvider(appliedSceneProvider)
    setCloseupProvider(appliedCloseupProvider)
  }
  const [selectedSceneId, setSelectedSceneId] = useState<string>("")
  const [scenes, setScenes] = useState<SceneInfo[]>([])
  const [images, setImages] = useState<ImageRecord[]>([])
  const [evidences, setEvidences] = useState<EvidenceItem[]>([])
  const [generating, setGenerating] = useState(false)
  const [batchGenerating, setBatchGenerating] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, label: "" })
  const [omittedWarning, setOmittedWarning] = useState("")
  const [warning, setWarning] = useState("")
  const [error, setError] = useState("")

  // Selected image IDs for report export
  const [selectedImageIds, setSelectedImageIds] = useState<Set<number>>(new Set())

  function toggleImageId(id: number) {
    const next = new Set(selectedImageIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedImageIds(next)
  }

  function toggleAllImageIds(ids: number[]) {
    const allSelected = ids.every(id => selectedImageIds.has(id))
    const next = new Set(selectedImageIds)
    if (allSelected) {
      ids.forEach(id => next.delete(id))
    } else {
      ids.forEach(id => next.add(id))
    }
    setSelectedImageIds(next)
  }
  const [closeups, setCloseups] = useState<Record<number, CloseupState>>({})
  /** 每个物证的自定义细节描述 */
  const [closeupCustomDetails, setCloseupCustomDetails] = useState<Record<number, string>>({})
  /** 哪些物证展开了细节输入框 */
  const [detailsExpanded, setDetailsExpanded] = useState<Set<number>>(new Set())
  const [panelOpen, setPanelOpen] = useState(true)
  const [cropPositions, setCropPositions] = useState<Record<number, { x: number; y: number }>>({})

  // ---- Data fetching ----
  const fetchData = useCallback(async () => {
    try {
      const [projects, sceneList, imgList, evList] = await Promise.all([
        jevx.getProjects(),
        jevx.getScenes(Number(caseId)).catch(() => [] as SceneInfo[]),
        jevx.getImages(Number(caseId)).catch(() => [] as ImageRecord[]),
        jevx.getEvidence(Number(caseId)).catch(() => [] as EvidenceItem[]),
      ])
      const current = projects.find((p) => p.id === Number(caseId))
      if (current) setCaseTitle(current.title)
      setScenes(sceneList as SceneInfo[])
      setImages(imgList as ImageRecord[])
      setEvidences(evList as EvidenceItem[])
    } catch {
      // silent
    }
  }, [caseId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ---- Generate single scene ----
  const handleGenerateScene = async () => {
    const sceneId = selectedSceneId === "all" ? undefined : Number(selectedSceneId)
    setGenerating(true)
    setError("")
    setOmittedWarning("")
    setWarning("")
    setProgress({ current: 0, total: 1, label: "生成中..." })

    try {
      const result = await jevx.generateImages(Number(caseId), {
        scene_id: sceneId,
        provider_config: {
          scene_overview: appliedSceneProvider,
          evidence_closeup: appliedCloseupProvider,
          document_render: "pillow",
        },
      })

      if (result.image) {
        setImages((prev) => [...prev, result.image as unknown as ImageRecord])
      }

      if (result.warning?.should_warn) {
        setWarning(result.warning.message)
      }

      if (result.omitted_items.length > 0) {
        setOmittedWarning(
          `以下物品因 prompt 长度超限未能呈现：${result.omitted_items.join("、")}。\n建议：将该场景拆分，或在场景管理页减少该场景的物品数量。`
        )
      }

      setProgress({ current: 1, total: 1, label: "完成" })
    } catch (err) {
      setError(err instanceof Error ? err.message : "图像生成失败")
    } finally {
      setGenerating(false)
    }
  }

  // ---- Generate all scenes ----
  const handleGenerateAll = async () => {
    setBatchGenerating(true)
    setError("")
    setOmittedWarning("")
    setWarning("")
    setProgress({ current: 0, total: scenes.length, label: `0/${scenes.length}` })

    try {
      const result = await jevx.generateAllScenes(Number(caseId), { provider: appliedSceneProvider })

      if (result.errors.length > 0) {
        setError(
          `${result.generated}/${result.total_scenes} 个场景生成成功，${result.failed} 个失败: ${result.errors.map((e) => e.scene).join("、")}`
        )
      }

      // Refresh images after batch
      await fetchData()
      setProgress({ current: result.total_scenes, total: result.total_scenes, label: "完成" })
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量生成失败")
    } finally {
      setBatchGenerating(false)
    }
  }

  // ---- Generate closeup for a single evidence ----
  const handleGenerateCloseup = async (evidenceId: number) => {
    // Find which scene this evidence belongs to
    const ev = evidences.find(e => e.id === evidenceId)
    const sceneId = ev?.scene_id

    setCloseups((prev) => ({
      ...prev,
      [evidenceId]: { evidenceId, loading: true },
    }))
    try {
      const data: Record<string, unknown> = {
        provider_config: {
          scene_overview: appliedSceneProvider,
          evidence_closeup: appliedCloseupProvider,
          document_render: "pillow",
        },
      }
      // Pass manual crop position if available for this scene
      if (appliedCloseupProvider === "crop" && sceneId && cropPositions[sceneId]) {
        data.crop_position = cropPositions[sceneId]
      }
      // Pass custom details if user provided them
      const details = closeupCustomDetails[evidenceId]
      if (details?.trim()) {
        data.custom_details = details.trim()
      }
      const result = await jevx.generateEvidenceCloseup(evidenceId, data)
      setCloseups((prev) => ({
        ...prev,
        [evidenceId]: {
          evidenceId,
          loading: false,
          imageId: (result as unknown as ImageRecord).id,
          imagePath: (result as unknown as ImageRecord).image_path,
        },
      }))
    } catch (err) {
      setCloseups((prev) => ({
        ...prev,
        [evidenceId]: {
          evidenceId,
          loading: false,
          error: err instanceof Error ? err.message : "生成失败",
        },
      }))
    }
  }

  const handleDeleteImage = async (imageId: number) => {
    if (!confirm("确认删除此图片？此操作不可恢复。")) return
    try {
      await jevx.deleteImage(imageId)
      setImages(prev => prev.filter(img => img.id !== imageId))
      setSelectedImageIds(prev => {
        const next = new Set(prev)
        next.delete(imageId)
        return next
      })
      // Also clean up closeup state for this image
      setCloseups(prev => {
        const next = { ...prev }
        for (const key of Object.keys(next)) {
          if (next[Number(key)]?.imageId === imageId) {
            delete next[Number(key)]
          }
        }
        return next
      })
    } catch (err) {
      console.error("删除图片失败:", err)
    }
  }

  // ---- Derived data ----
  const sceneImages = images.filter((img) => img.image_type === "scene_overview")
  const docImages = images.filter((img) => img.image_type === "document_render")
  const closeupImages = images.filter((img) => img.image_type === "evidence_closeup" || img.image_type === "injury_closeup")
  const busy = generating || batchGenerating

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-apple-text-secondary">
        <Link to="/cases" className="hover:text-apple-text-primary flex items-center gap-1">
          <Home className="h-3.5 w-3.5" />
          案件列表
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-apple-text-primary">{caseTitle}</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-apple-text-primary">图片生成</span>
      </nav>

      <h1 className="text-2xl font-bold tracking-tight">{caseTitle}</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* ================================================================ */}
        {/* Left: Control Panel */}
        {/* ================================================================ */}
        <GlassCard className="lg:col-span-1 h-fit">
          <button
            type="button"
            onClick={() => setPanelOpen(!panelOpen)}
            className="px-5 pt-5 pb-2 w-full text-left flex items-center justify-between"
          >
            <div>
              <h2 className="text-lg font-semibold text-apple-text-primary">图像生成</h2>
              <p className="text-xs text-apple-text-secondary">
                选择场景后点击生成，每次调用生成 1 张场景图
              </p>
            </div>
            <span className={`text-apple-text-tertiary transition-transform ${panelOpen ? "rotate-180" : ""}`}>
              <ChevronDown className="h-4 w-4" />
            </span>
          </button>
          {panelOpen && (
          <div className="px-5 pb-5 space-y-5">
            {/* Scene selector */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-apple-text-secondary">场景</label>
              <AppleSelect value={selectedSceneId} onValueChange={setSelectedSceneId}>
                <AppleSelectTrigger>
                  <AppleSelectValue placeholder="选择场景..." />
                </AppleSelectTrigger>
                <AppleSelectContent>
                  <AppleSelectItem value="all">全部场景</AppleSelectItem>
                  {scenes.map((s) => (
                    <AppleSelectItem key={s.id} value={String(s.id)}>
                      {s.name} ({s.evidence_count} 项)
                    </AppleSelectItem>
                  ))}
                </AppleSelectContent>
              </AppleSelect>
            </div>

            {/* Scene overview Provider */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-apple-text-secondary">场景全图 Provider</label>
              <AppleSelect value={sceneProvider} onValueChange={setSceneProvider}>
                <AppleSelectTrigger>
                  <AppleSelectValue />
                </AppleSelectTrigger>
                <AppleSelectContent>
                  <AppleSelectItem value="dalle">DALL·E（推荐，forensic理解最准）</AppleSelectItem>
                  <AppleSelectItem value="zenmux">ZenMux GPT-Image-2（最新，质量最优）</AppleSelectItem>
                  <AppleSelectItem value="agnes">Agnes Image 2.1 Flash</AppleSelectItem>
                  <AppleSelectItem value="flux">Flux</AppleSelectItem>
                </AppleSelectContent>
              </AppleSelect>
            </div>

            {/* Evidence closeup Provider */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-apple-text-secondary">物证特写方式</label>
              <AppleSelect value={closeupProvider} onValueChange={setCloseupProvider}>
                <AppleSelectTrigger>
                  <AppleSelectValue />
                </AppleSelectTrigger>
                <AppleSelectContent>
                  <AppleSelectItem value="dalle">DALL·E（推荐，AI 生成确保物证描述准确）</AppleSelectItem>
                  <AppleSelectItem value="zenmux">ZenMux GPT-Image-2（最新，质量最优）</AppleSelectItem>
                  <AppleSelectItem value="agnes">Agnes Image 2.1 Flash</AppleSelectItem>
                  <AppleSelectItem value="crop">裁剪法（零成本，但位置可能不精确）</AppleSelectItem>
                  <AppleSelectItem value="hunyuan">混元图像（需配置腾讯云 Key）</AppleSelectItem>
                </AppleSelectContent>
              </AppleSelect>
              {closeupProvider === "crop" && (
                <p className="text-xs text-apple-text-secondary mt-1.5 p-2 bg-apple-glass-bg-hover/60 rounded">
                  裁剪法直接从场景全图中截取物证位置放大，零成本且背景一致。
                  但 AI 生成的场景图中物品位置可能与预期有偏差，
                  导致裁剪区域显示其他物品。建议优先使用 DALL·E AI 生成。
                </p>
              )}

              {/* Model config apply / cancel */}
              {modelConfigDirty && (
                <div className="mt-2 rounded-xl border border-apple-accent/30 bg-apple-accent/5 p-3 space-y-2">
                  <p className="text-xs text-apple-text-secondary">模型配置已修改，点击 Apply 生效并保存：</p>
                  <div className="text-xs space-y-0.5 text-apple-text-primary">
                    {sceneProvider !== appliedSceneProvider && (
                      <p>场景全图: <span className="line-through text-apple-text-tertiary">{appliedSceneProvider}</span> → <span className="font-medium text-apple-accent">{sceneProvider}</span></p>
                    )}
                    {closeupProvider !== appliedCloseupProvider && (
                      <p>物证特写: <span className="line-through text-apple-text-tertiary">{appliedCloseupProvider}</span> → <span className="font-medium text-apple-accent">{closeupProvider}</span></p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <AppleButton size="sm" className="h-7 text-xs" onClick={applyModelConfig}>
                      <Check className="mr-1 h-3 w-3" />
                      Apply
                    </AppleButton>
                    <AppleButton size="sm" variant="outline" className="h-7 text-xs" onClick={cancelModelConfig}>
                      <X className="mr-1 h-3 w-3" />
                      Cancel
                    </AppleButton>
                  </div>
                </div>
              )}

              {/* Current active model indicator */}
              {!modelConfigDirty && (
                <div className="mt-2 text-xs text-apple-text-tertiary flex items-center gap-1">
                  <Check className="h-3 w-3 text-green-500" />
                  当前: 全图 <span className="font-medium text-apple-text-secondary">{appliedSceneProvider}</span>
                  {" · "}特写 <span className="font-medium text-apple-text-secondary">{appliedCloseupProvider}</span>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <AppleButton
              className="w-full"
              onClick={handleGenerateScene}
              disabled={busy || !selectedSceneId || selectedSceneId === "all"}
            >
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <ImageIcon className="mr-2 h-4 w-4" />
                  生成此场景
                </>
              )}
            </AppleButton>

            <AppleButton
              variant="outline"
              className="w-full"
              onClick={handleGenerateAll}
              disabled={busy || scenes.length === 0}
            >
              {batchGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {progress.label}
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  生成全部场景
                </>
              )}
            </AppleButton>

            {/* Progress bar */}
            {busy && progress.total > 0 && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-apple-text-secondary">
                  <span>{progress.label}</span>
                  <span>
                    {progress.current}/{progress.total}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-apple-glass-border/30" />

            {/* Export report */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4 text-apple-accent" />
                <p className="text-sm font-medium text-apple-text-primary">导出分析报告</p>
              </div>
              <p className="text-xs text-apple-text-secondary">
                勾选下方图片纳入报告，不勾选则包含全部。
              </p>
              <p className="text-xs text-apple-text-tertiary">
                已选 {selectedImageIds.size} 项
              </p>
              <AppleButton
                variant="outline"
                className="w-full"
                size="sm"
                onClick={async () => {
                  try {
                    let url = `/api/v1/cases/${caseId}/report?fmt=html`
                    if (selectedImageIds.size > 0) {
                      const ids = Array.from(selectedImageIds).join(",")
                      url += `&image_ids=${ids}`
                    }
                    const token = localStorage.getItem("access_token")
                    const headers: Record<string, string> = {}
                    if (token) headers["Authorization"] = `Bearer ${token}`
                    const resp = await fetch(url, { headers })
                    if (!resp.ok) throw new Error(`导出失败 (${resp.status})`)
                    const html = await resp.text()
                    const blob = new Blob([html], { type: "text/html" })
                    const downloadUrl = URL.createObjectURL(blob)
                    const a = document.createElement("a")
                    a.href = downloadUrl
                    a.download = `分析报告_${caseId}.html`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    URL.revokeObjectURL(downloadUrl)
                  } catch (e) {
                    alert(`导出分析报告失败: ${e instanceof Error ? e.message : e}`)
                  }
                }}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                导出分析报告
              </AppleButton>
            </div>
          </div>
          )}
        </GlassCard>

        {/* ================================================================ */}
        {/* Right: Results */}
        {/* ================================================================ */}
        <div className="space-y-6 lg:col-span-3">
          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {warning && (
            <div className="rounded-xl border border-yellow-500/50 bg-yellow-50/30 dark:bg-yellow-950/10 px-4 py-3 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
                <span className="text-yellow-700 dark:text-yellow-400">{warning}</span>
              </div>
            </div>
          )}

          {omittedWarning && (
            <div className="rounded-xl border border-orange-500/50 bg-orange-50/30 dark:bg-orange-950/10 px-4 py-3 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                <span className="text-orange-700 dark:text-orange-400">
                  {omittedWarning}
                </span>
              </div>
            </div>
          )}

          {/* ---- Scene Overviews ---- */}
          {sceneImages.length > 0 ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-apple-accent" />
                场景图
                <button
                  type="button"
                  onClick={() => toggleAllImageIds(sceneImages.map(i => i.id))}
                  className="ml-auto text-xs text-apple-text-secondary hover:text-apple-accent transition-colors"
                >
                  {sceneImages.every(i => selectedImageIds.has(i.id)) ? "取消全选" : "全选"}
                </button>
              </h3>
              {sceneImages.map((img) => {
                const sceneName =
                  scenes.find((s) => s.id === img.scene_id)?.name || "未分配场景"
                return (
                  <GlassCard key={img.id}>
                    <div className="px-5 pb-2">
                      <h3 className="text-base font-semibold flex items-center justify-between text-apple-text-primary">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedImageIds.has(img.id)}
                            onChange={() => toggleImageId(img.id)}
                            className="h-4 w-4 shrink-0 rounded border-apple-glass-border/50 accent-apple-accent"
                          />
                          {sceneName}
                          <AppleBadge variant="outline" className="text-xs">
                            {img.provider || "unknown"}
                          </AppleBadge>
                        </span>
                      </h3>
                    </div>
                    <div className="px-5 pb-5">
                      <img
                        src={imageUrl(img.image_path)}
                        alt={`${sceneName} 场景图`}
                        className="w-full rounded-md border border-apple-glass-border/50 object-cover"
                        style={{ maxHeight: 400 }}
                      />
                      {appliedCloseupProvider === "crop" && img.scene_id && (
                        <div className="mt-3">
                          <SceneImageClickPicker
                            sceneImagePath={imageUrl(img.image_path)}
                            onPick={(x: number, y: number) => {
                              setCropPositions(prev => ({
                                ...prev,
                                [img.scene_id!]: { x, y },
                              }))
                            }}
                          />
                        </div>
                      )}
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleDeleteImage(img.id)}
                          className="inline-flex items-center justify-center h-8 px-2 text-xs font-medium rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all"
                          title="删除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <a
                          href={imageUrl(img.image_path)}
                          download
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center h-8 px-3 text-xs font-medium rounded-xl border border-apple-glass-border bg-apple-glass-bg text-foreground hover:bg-apple-glass-bg-hover/60 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/50 disabled:pointer-events-none disabled:opacity-50"
                        >
                          <Download className="mr-1 h-3.5 w-3.5" />
                          下载
                        </a>
                      </div>
                    </div>
                  </GlassCard>
                )
              })}
            </div>
          ) : busy ? (
            <GlassCard>
              <div className="py-8">
                <Skeleton className="h-[400px] w-full rounded-md" />
              </div>
            </GlassCard>
          ) : null}

          {/* ---- Evidence list with closeup buttons ---- */}
          {scenes.map((sc) => {
            const sceneEvs = evidences.filter(
              (e) => e.scene_id === sc.id && e.is_approved && !e.is_excluded && e.evidence_type !== "书证"
            )
            if (sceneEvs.length === 0) return null
            return (
              <GlassCard key={`evlist-${sc.id}`}>
                <div className="px-5 pb-2">
                  <h3 className="text-base font-semibold flex items-center gap-2 text-apple-text-primary">
                    {sc.name} — 物证特写
                    <AppleBadge variant="secondary" className="text-xs">{sceneEvs.length} 项</AppleBadge>
                    <button
                      type="button"
                      onClick={() => {
                        const imgIds = sceneEvs.map(e => closeups[e.id]?.imageId).filter(Boolean) as number[]
                        toggleAllImageIds(imgIds)
                      }}
                      className="ml-auto text-xs text-apple-text-secondary hover:text-apple-accent transition-colors"
                    >
                      {sceneEvs.every(e => {
                        const imgId = closeups[e.id]?.imageId
                        return imgId && selectedImageIds.has(imgId)
                      }) ? "取消全选" : "全选"}
                    </button>
                  </h3>
                </div>
                <div className="px-5 pb-5">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {sceneEvs.map((ev) => {
                      const cs = closeups[ev.id]
                      const busyItem = cs?.loading
                      const doneItem = cs?.imagePath
                      const isExpanded = detailsExpanded.has(ev.id)
                      return (
                        <div key={ev.id}>
                          <div className="flex items-center gap-2 rounded-xl border border-apple-glass-border/50 px-3 py-2 bg-apple-glass-bg/70">
                            {cs?.imageId && (
                              <input
                                type="checkbox"
                                checked={selectedImageIds.has(cs.imageId)}
                                onChange={() => toggleImageId(cs.imageId)}
                                className="h-4 w-4 shrink-0 rounded border-apple-glass-border/50 accent-apple-accent"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate text-apple-text-primary">{ev.description}</p>
                              {ev.state_json && (
                                <p className="text-xs text-apple-text-secondary truncate">
                                  {ev.state_json.replace(/[{}"]/g, "").replace(/,/g, "，")}
                                </p>
                              )}
                            </div>
                            {doneItem ? (
                              <a href={imageUrl(cs!.imagePath!)} target="_blank" rel="noopener noreferrer">
                                <AppleButton variant="outline" className="h-7 text-xs shrink-0">
                                  <Download className="mr-1 h-3 w-3" />
                                  查看
                                </AppleButton>
                              </a>
                            ) : (
                              <>
                                <AppleButton
                                  variant="outline"
                                  className="h-7 text-xs shrink-0"
                                  disabled={busyItem}
                                  onClick={() => handleGenerateCloseup(ev.id)}
                                >
                                  {busyItem ? (
                                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                  ) : (
                                    <RefreshCw className="mr-1 h-3 w-3" />
                                  )}
                                  特写
                                </AppleButton>
                                <AppleButton
                                  variant={isExpanded ? "accent" : "ghost"}
                                  className="h-7 w-7 p-0 shrink-0"
                                  title={isExpanded ? "收起细节" : "添加细节描述"}
                                  onClick={() => {
                                    setDetailsExpanded(prev => {
                                      const next = new Set(prev)
                                      if (next.has(ev.id)) next.delete(ev.id)
                                      else next.add(ev.id)
                                      return next
                                    })
                                  }}
                                >
                                  <PenLine className="h-3.5 w-3.5" />
                                </AppleButton>
                              </>
                            )}
                          </div>
                          {/* 细节输入框（展开时显示） */}
                          {isExpanded && !doneItem && (
                            <div className="mt-1.5 px-1">
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  placeholder="补充细节，如：刀刃上有明显血迹、拖鞋底有泥土痕迹..."
                                  className="flex-1 h-8 rounded-lg border border-apple-glass-border/50 bg-apple-glass-bg/50 px-3 text-xs text-apple-text-primary placeholder:text-apple-text-tertiary focus:outline-none focus:ring-1 focus:ring-apple-accent/50"
                                  value={closeupCustomDetails[ev.id] || ""}
                                  onChange={(e) => {
                                    setCloseupCustomDetails(prev => ({
                                      ...prev,
                                      [ev.id]: e.target.value,
                                    }))
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !busyItem) {
                                      handleGenerateCloseup(ev.id)
                                    }
                                  }}
                                />
                                <AppleButton
                                  size="sm"
                                  className="h-7 text-xs shrink-0"
                                  disabled={busyItem}
                                  onClick={() => handleGenerateCloseup(ev.id)}
                                >
                                  {busyItem ? <Loader2 className="h-3 w-3 animate-spin" /> : "生成"}
                                </AppleButton>
                              </div>
                              <p className="mt-1 text-[10px] text-apple-text-tertiary px-1">
                                按 Enter 或点击「生成」提交细节，将覆盖自动提取的特征描述
                              </p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </GlassCard>
            )
          })}

          {/* ---- Evidence Closeups ---- */}
          {closeupImages.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                物证特写
                <button
                  type="button"
                  onClick={() => toggleAllImageIds(closeupImages.map(i => i.id))}
                  className="ml-auto text-xs text-apple-text-secondary hover:text-apple-accent transition-colors"
                >
                  {closeupImages.every(i => selectedImageIds.has(i.id)) ? "取消全选" : "全选"}
                </button>
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {closeupImages.map((img) => {
                  const cState = closeups[img.id]
                  const strategy = img.closeup_strategy || img.strategy_used
                  return (
                    <GlassCard key={img.id}>
                      <div className="px-4 pt-3 pb-0 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedImageIds.has(img.id)}
                          onChange={() => toggleImageId(img.id)}
                          className="h-4 w-4 shrink-0 rounded border-apple-glass-border/50 accent-apple-accent"
                        />
                        <span className="text-sm text-apple-text-secondary">特写 #{img.id}</span>
                      </div>
                      <div className="pt-3">
                        <img
                          src={imageUrl(img.image_path)}
                          alt={`特写 #${img.id}`}
                          className="w-full rounded-md border border-apple-glass-border/50 object-cover"
                          style={{ maxHeight: 250 }}
                        />
                        {img.reference_preview_path && img.has_reference_preview && (
                          <div className="mt-2">
                            <p className="text-xs text-apple-text-secondary mb-1">裁剪位置参考（红框为裁剪区域）：</p>
                            <img
                              src={imageUrl(img.reference_preview_path)}
                              alt="裁剪位置参考"
                              className="w-32 h-32 object-cover rounded border border-apple-glass-border/50 cursor-pointer"
                              onClick={() => window.open(imageUrl(img.reference_preview_path!), '_blank')}
                              title="点击查看完整参考图"
                            />
                          </div>
                        )}
                        <div className="mt-2 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleDeleteImage(img.id)}
                            className="inline-flex items-center justify-center h-8 px-2 text-xs font-medium rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all"
                            title="删除"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <a
                            href={imageUrl(img.image_path)}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center h-8 px-3 text-xs font-medium rounded-xl border border-apple-glass-border bg-apple-glass-bg text-foreground hover:bg-apple-glass-bg-hover/60 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/50 disabled:pointer-events-none disabled:opacity-50"
                          >
                            <Download className="mr-1 h-3.5 w-3.5" />
                            下载
                          </a>
                        </div>
                        {strategy && (
                          <div className="mt-1.5">
                            <StrategyBadge strategy={strategy} />
                          </div>
                        )}
                      </div>
                    </GlassCard>
                  )
                })}
                {/* Render inline closeup buttons + results */}
                {Object.values(closeups).map((cs) =>
                  cs.imagePath ? (
                    <GlassCard key={`closeup-${cs.evidenceId}`}>
                      <div className="pt-5">
                        <img
                          src={imageUrl(cs.imagePath)}
                          alt={`特写 #${cs.evidenceId}`}
                          className="w-full rounded-md border border-apple-glass-border/50 object-cover"
                          style={{ maxHeight: 250 }}
                        />
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-sm text-apple-text-secondary">
                            证据 #{cs.evidenceId}
                          </span>
                          <div className="flex gap-2">
                            {cs.imageId && (
                              <button
                                type="button"
                                onClick={() => handleDeleteImage(cs.imageId!)}
                                className="inline-flex items-center justify-center h-8 px-2 text-xs font-medium rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all"
                                title="删除"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <a
                              href={imageUrl(cs.imagePath)}
                              download
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center h-8 px-3 text-xs font-medium rounded-xl border border-apple-glass-border bg-apple-glass-bg text-foreground hover:bg-apple-glass-bg-hover/60 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/50 disabled:pointer-events-none disabled:opacity-50"
                            >
                              <Download className="mr-1 h-3.5 w-3.5" />
                              下载
                            </a>
                          </div>
                        </div>
                      </div>
                    </GlassCard>
                  ) : null
                )}
              </div>
            </div>
          )}

          {/* ---- Document Renders ---- */}
          {docImages.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                书证渲染
                <button
                  type="button"
                  onClick={() => toggleAllImageIds(docImages.map(i => i.id))}
                  className="ml-auto text-xs text-apple-text-secondary hover:text-apple-accent transition-colors"
                >
                  {docImages.every(i => selectedImageIds.has(i.id)) ? "取消全选" : "全选"}
                </button>
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {docImages.map((img) => (
                  <GlassCard key={img.id}>
                    <div className="px-4 pt-3 pb-0 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedImageIds.has(img.id)}
                        onChange={() => toggleImageId(img.id)}
                        className="h-4 w-4 shrink-0 rounded border-apple-glass-border/50 accent-apple-accent"
                      />
                      <span className="text-sm text-apple-text-secondary">书证 #{img.id}</span>
                    </div>
                    <div className="pt-3">
                      <img
                        src={imageUrl(img.image_path)}
                        alt={`书证 #${img.id}`}
                        className="w-full rounded-md border border-apple-glass-border/50 object-cover"
                        style={{ maxHeight: 300 }}
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleDeleteImage(img.id)}
                          className="inline-flex items-center justify-center h-8 px-2 text-xs font-medium rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all"
                          title="删除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <a
                          href={imageUrl(img.image_path)}
                          download
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center h-8 px-3 text-xs font-medium rounded-xl border border-apple-glass-border bg-apple-glass-bg text-foreground hover:bg-apple-glass-bg-hover/60 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/50 disabled:pointer-events-none disabled:opacity-50"
                        >
                          <Download className="mr-1 h-3.5 w-3.5" />
                          下载
                        </a>
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}

          {/* ---- Empty State ---- */}
          {!busy &&
            sceneImages.length === 0 &&
            closeupImages.length === 0 &&
            docImages.length === 0 && (
              <GlassCard>
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <ImageIcon className="h-12 w-12 text-apple-text-secondary mb-4" />
                  <h3 className="text-lg font-semibold mb-2 text-apple-text-primary">尚未生成图片</h3>
                  <p className="text-apple-text-secondary mb-4 max-w-sm">
                    请先在左侧选择场景和 Provider，然后点击"生成此场景"。
                    系统将为该场景一次性生成包含所有物证的完整场景图。
                  </p>
                </div>
              </GlassCard>
            )}
        </div>
      </div>
    </div>
  )
}

// Export via Route only (TanStack Router file-based routing)
