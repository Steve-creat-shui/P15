import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Download,
  Home,
  ImageIcon,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { jevx } from "@/lib/jevx"

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
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs
                        bg-green-100 text-green-800 border border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800">
        ✂️ 裁剪法 · 背景100%一致
      </span>
    )
  }
  if (strategy === "background_inpaint") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs
                        bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800">
        🎯 场景背景+AI物证 · 背景100%匹配
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs
                      bg-yellow-100 text-yellow-800 border border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-800">
      🤖 AI生成 · 背景相似
    </span>
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
  const [sceneProvider, setSceneProvider] = useState("dalle")
  const [closeupProvider, setCloseupProvider] = useState("dalle")
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
  const [closeups, setCloseups] = useState<Record<number, CloseupState>>({})

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
          scene_overview: sceneProvider,
          evidence_closeup: closeupProvider,
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
      const result = await jevx.generateAllScenes(Number(caseId), { provider: sceneProvider })

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
    setCloseups((prev) => ({
      ...prev,
      [evidenceId]: { evidenceId, loading: true },
    }))
    try {
      const result = await jevx.generateEvidenceCloseup(evidenceId, {
        provider_config: {
          scene_overview: sceneProvider,
          evidence_closeup: closeupProvider,
          document_render: "pillow",
        },
      })
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

  // ---- Derived data ----
  const sceneImages = images.filter((img) => img.image_type === "scene_overview")
  const docImages = images.filter((img) => img.image_type === "document_render")
  const closeupImages = images.filter((img) => img.image_type === "evidence_closeup")
  const busy = generating || batchGenerating

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/cases" className="hover:text-foreground flex items-center gap-1">
          <Home className="h-3.5 w-3.5" />
          案件列表
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-foreground">{caseTitle}</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">图片生成</span>
      </nav>

      <h1 className="text-2xl font-bold tracking-tight">{caseTitle}</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* ================================================================ */}
        {/* Left: Control Panel */}
        {/* ================================================================ */}
        <Card className="lg:col-span-1 h-fit">
          <CardHeader>
            <CardTitle className="text-lg">图像生成</CardTitle>
            <p className="text-xs text-muted-foreground">
              选择场景后点击生成，每次调用生成 1 张场景图
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Scene selector */}
            <div className="space-y-2">
              <Label>场景</Label>
              <Select value={selectedSceneId} onValueChange={setSelectedSceneId}>
                <SelectTrigger>
                  <SelectValue placeholder="选择场景..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部场景</SelectItem>
                  {scenes.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name} ({s.evidence_count} 项)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Scene overview Provider */}
            <div className="space-y-2">
              <Label>场景全图 Provider</Label>
              <Select value={sceneProvider} onValueChange={setSceneProvider}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dalle">DALL·E（推荐，forensic理解最准）</SelectItem>
                  <SelectItem value="flux">Flux</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Evidence closeup Provider */}
            <div className="space-y-2">
              <Label>物证特写方式</Label>
              <Select value={closeupProvider} onValueChange={setCloseupProvider}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dalle">🤖 DALL·E（推荐，AI 生成确保物证描述准确）</SelectItem>
                  <SelectItem value="crop">✂️ 裁剪法（零成本，但位置可能不精确）</SelectItem>
                  <SelectItem value="hunyuan">混元图像（需配置腾讯云 Key）</SelectItem>
                </SelectContent>
              </Select>
              {closeupProvider === "crop" && (
                <p className="text-xs text-muted-foreground mt-1.5 p-2 bg-muted/50 rounded">
                  ⚠️ 裁剪法直接从场景全图中截取物证位置放大，零成本且背景一致。
                  但 AI 生成的场景图中物品位置可能与预期有偏差，
                  导致裁剪区域显示其他物品。建议优先使用 DALL·E AI 生成。
                </p>
              )}
            </div>

            {/* Action buttons */}
            <Button
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
            </Button>

            <Button
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
            </Button>

            {/* Progress bar */}
            {busy && progress.total > 0 && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
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
          </CardContent>
        </Card>

        {/* ================================================================ */}
        {/* Right: Results */}
        {/* ================================================================ */}
        <div className="space-y-6 lg:col-span-3">
          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {warning && (
            <div className="rounded-md border border-yellow-500/50 bg-yellow-50/30 dark:bg-yellow-950/10 px-4 py-3 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
                <span className="text-yellow-700 dark:text-yellow-400">{warning}</span>
              </div>
            </div>
          )}

          {omittedWarning && (
            <div className="rounded-md border border-orange-500/50 bg-orange-50/30 dark:bg-orange-950/10 px-4 py-3 text-sm">
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
                <ImageIcon className="h-4 w-4" />
                场景图
              </h3>
              {sceneImages.map((img) => {
                const sceneName =
                  scenes.find((s) => s.id === img.scene_id)?.name || "未分配场景"
                return (
                  <Card key={img.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          {sceneName}
                          <Badge variant="outline" className="text-xs">
                            {img.provider || "unknown"}
                          </Badge>
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <img
                        src={imageUrl(img.image_path)}
                        alt={`${sceneName} 场景图`}
                        className="w-full rounded-md border object-cover"
                        style={{ maxHeight: 400 }}
                      />
                      <div className="mt-2 flex justify-end">
                        <Button size="sm" variant="outline" asChild>
                          <a
                            href={imageUrl(img.image_path)}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Download className="mr-1 h-3.5 w-3.5" />
                            下载
                          </a>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ) : busy ? (
            <Card>
              <CardContent className="py-8">
                <Skeleton className="h-[400px] w-full rounded-md" />
              </CardContent>
            </Card>
          ) : null}

          {/* ---- Evidence list with closeup buttons ---- */}
          {scenes.map((sc) => {
            const sceneEvs = evidences.filter(
              (e) => e.scene_id === sc.id && e.is_approved && !e.is_excluded && e.evidence_type !== "书证"
            )
            if (sceneEvs.length === 0) return null
            return (
              <Card key={`evlist-${sc.id}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    🔍 {sc.name} — 物证特写
                    <Badge variant="secondary" className="text-xs">{sceneEvs.length} 项</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {sceneEvs.map((ev) => {
                      const cs = closeups[ev.id]
                      const busyItem = cs?.loading
                      const doneItem = cs?.imagePath
                      return (
                        <div key={ev.id} className="flex items-center gap-2 rounded border px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{ev.description}</p>
                            {ev.state_json && (
                              <p className="text-xs text-muted-foreground truncate">
                                {ev.state_json.replace(/[{}"]/g, "").replace(/,/g, "，")}
                              </p>
                            )}
                          </div>
                          {doneItem ? (
                            <a href={imageUrl(cs!.imagePath!)} target="_blank" rel="noopener noreferrer">
                              <Button size="sm" variant="outline" className="h-7 text-xs shrink-0">
                                <Download className="mr-1 h-3 w-3" />
                                查看
                              </Button>
                            </a>
                          ) : (
                            <Button
                              size="sm"
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
                            </Button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )
          })}

          {/* ---- Evidence Closeups ---- */}
          {closeupImages.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">🧪 物证特写</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {closeupImages.map((img) => {
                  const cState = closeups[img.id]
                  const strategy = img.closeup_strategy || img.strategy_used
                  return (
                    <Card key={img.id}>
                      <CardContent className="pt-4">
                        <img
                          src={imageUrl(img.image_path)}
                          alt={`特写 #${img.id}`}
                          className="w-full rounded-md border object-cover"
                          style={{ maxHeight: 250 }}
                        />
                        {img.reference_preview_path && img.has_reference_preview && (
                          <div className="mt-2">
                            <p className="text-xs text-muted-foreground mb-1">裁剪位置参考（红框为裁剪区域）：</p>
                            <img
                              src={imageUrl(img.reference_preview_path)}
                              alt="裁剪位置参考"
                              className="w-32 h-32 object-cover rounded border cursor-pointer"
                              onClick={() => window.open(imageUrl(img.reference_preview_path!), '_blank')}
                              title="点击查看完整参考图"
                            />
                          </div>
                        )}
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            特写 #{img.id}
                          </span>
                          <Button size="sm" variant="outline" asChild>
                            <a
                              href={imageUrl(img.image_path)}
                              download
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Download className="mr-1 h-3.5 w-3.5" />
                              下载
                            </a>
                          </Button>
                        </div>
                        {strategy && (
                          <div className="mt-1.5">
                            <StrategyBadge strategy={strategy} />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
                {/* Render inline closeup buttons + results */}
                {Object.values(closeups).map((cs) =>
                  cs.imagePath ? (
                    <Card key={`closeup-${cs.evidenceId}`}>
                      <CardContent className="pt-4">
                        <img
                          src={imageUrl(cs.imagePath)}
                          alt={`特写 #${cs.evidenceId}`}
                          className="w-full rounded-md border object-cover"
                          style={{ maxHeight: 250 }}
                        />
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            证据 #{cs.evidenceId}
                          </span>
                          <Button size="sm" variant="outline" asChild>
                            <a
                              href={imageUrl(cs.imagePath)}
                              download
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Download className="mr-1 h-3.5 w-3.5" />
                              下载
                            </a>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null
                )}
              </div>
            </div>
          )}

          {/* ---- Document Renders ---- */}
          {docImages.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">📄 书证渲染</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {docImages.map((img) => (
                  <Card key={img.id}>
                    <CardContent className="pt-4">
                      <img
                        src={imageUrl(img.image_path)}
                        alt={`书证 #${img.id}`}
                        className="w-full rounded-md border object-cover"
                        style={{ maxHeight: 300 }}
                      />
                      <div className="mt-2 flex justify-end">
                        <Button size="sm" variant="outline" asChild>
                          <a
                            href={imageUrl(img.image_path)}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Download className="mr-1 h-3.5 w-3.5" />
                            下载
                          </a>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* ---- Empty State ---- */}
          {!busy &&
            sceneImages.length === 0 &&
            closeupImages.length === 0 &&
            docImages.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">尚未生成图片</h3>
                  <p className="text-muted-foreground mb-4 max-w-sm">
                    请先在左侧选择场景和 Provider，然后点击"生成此场景"。
                    系统将为该场景一次性生成包含所有物证的完整场景图。
                  </p>
                </CardContent>
              </Card>
            )}
        </div>
      </div>
    </div>
  )
}

// Export via Route only (TanStack Router file-based routing)
