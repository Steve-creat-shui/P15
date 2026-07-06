import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  FileText,
  Image,
  Layers,
  Loader2,
  MapPin,
  RefreshCw,
  ZoomIn,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DocumentTemplateForm } from "@/components/JEVS/DocumentTemplateForm"
import { InjuryCloseupForm } from "@/components/JEVS/InjuryCloseupForm"
import { jevx, LOCATION_KEYS } from "@/lib/jevx"

type EvidenceItem = {
  id: number
  category: string
  evidence_type: string
  description: string
  location: string | null
  state_json: string | null
  is_approved: boolean
  is_excluded: boolean
  scene_id: number | null
}

interface SceneInfo {
  id: number
  name: string
  room_type: string
  evidence_count: number
}

export const Route = createFileRoute("/_layout/cases/$caseId/evidence")({
  component: EvidenceReview,
  head: () => ({
    meta: [{ title: "证据审核 - JEVS" }],
  }),
})

function EvidenceReview() {
  const { caseId } = useParams({ from: "/_layout/cases/$caseId/evidence" })
  const navigate = useNavigate()
  const [caseTitle, setCaseTitle] = useState("")
  const [caseStatus, setCaseStatus] = useState("")
  const [evidences, setEvidences] = useState<EvidenceItem[]>([])
  const [scenes, setScenes] = useState<SceneInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [docFormExpanded, setDocFormExpanded] = useState<Set<number>>(new Set())
  const [injuryFormExpanded, setInjuryFormExpanded] = useState<Set<number>>(new Set())
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState("")

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [all, sceneList] = await Promise.all([
        jevx.getEvidence(Number(caseId)),
        jevx.getScenes(Number(caseId)).catch(() => [] as SceneInfo[]),
      ])
      setEvidences(all as EvidenceItem[])
      setScenes(sceneList as SceneInfo[])

      const projects = await jevx.getProjects()
      const current = projects.find((p) => p.id === Number(caseId))
      if (current) {
        setCaseTitle(current.title)
        setCaseStatus(current.status)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败")
    } finally {
      setLoading(false)
    }
  }, [caseId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleUpdate = async (
    evidenceId: number,
    data: {
      is_approved?: boolean
      is_excluded?: boolean
      location?: string
      scene_id?: number | null
    },
  ) => {
    try {
      await jevx.updateEvidence(evidenceId, data)
      setEvidences((prev) =>
        prev.map((ev) =>
          ev.id === evidenceId ? { ...ev, ...data } : ev,
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失败")
    }
  }

  const handleApprove = (id: number) =>
    handleUpdate(id, { is_approved: true, is_excluded: false })

  const handleExclude = (id: number) =>
    handleUpdate(id, { is_excluded: true, is_approved: false })

  const handleLocationChange = (id: number, location: string) =>
    handleUpdate(id, { location })

  const handleBuildScene = async () => {
    setBuilding(true)
    setError("")
    try {
      await jevx.buildScene(Number(caseId))
      navigate({
        to: "/cases/$caseId/generate",
        params: { caseId },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "场景构建失败")
      setBuilding(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error && evidences.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" className="mt-4" onClick={fetchData}>
          重试
        </Button>
      </div>
    )
  }

  const statusLabels: Record<string, string> = {
    pending: "待处理",
    extracted: "已提取证据",
    reviewed: "已推演现场",
    generated: "已生成图像",
  }

  const extractable = evidences.filter(
    (e) => e.category === "extractable" && !e.is_excluded,
  )
  const uncertain = evidences.filter(
    (e) => e.category === "uncertain" && !e.is_excluded,
  )
  const nonVisual = evidences.filter(
    (e) => e.category === "non_visualizable" || e.is_excluded,
  )

  const parseState = (stateJson: string | null) => {
    if (!stateJson) return []
    try {
      const obj = JSON.parse(stateJson) as Record<string, unknown>
      return Object.entries(obj)
        .filter(([, v]) => v === true || typeof v === "string")
        .map(([k, v]) => (typeof v === "string" ? `${k}: ${v}` : k))
    } catch {
      return []
    }
  }

  const hasInjuryKeywords = (description: string): boolean => {
    const keywords = [
      "伤", "伤情", "受伤", "擦伤", "挫伤", "淤青", "淤血", "血肿",
      "骨折", "裂伤", "创口", "伤口", "疤痕", "瘢痕", "抓痕",
      "烧伤", "烫伤", "刀伤", "刺伤", "砍伤", "钝器伤", "锐器伤",
      "皮下出血", "表皮剥脱", "红肿", "肿胀", "疼痛",
      "人身检查", "伤情鉴定", "法医鉴定", "身体检查",
    ]
    return keywords.some((kw) => description.includes(kw))
  }

  const isInjuryEvidence = (ev: EvidenceItem): boolean => {
    if (ev.evidence_type === "人身检查") return true
    if (hasInjuryKeywords(ev.description)) return true
    return false
  }

  const renderEvidenceList = (list: EvidenceItem[], showActions: boolean) => {
    if (list.length === 0) {
      return (
        <p className="py-8 text-center text-sm text-muted-foreground">暂无数据</p>
      )
    }

    return (
      <div className="space-y-3">
        {list.map((ev) => {
          const states = parseState(ev.state_json)
          const excluded = ev.is_excluded
          const approved = ev.is_approved

          return (
            <Card
              key={ev.id}
              className={
                excluded
                  ? "opacity-60"
                  : approved
                    ? "border-green-500/50 bg-green-50/30 dark:bg-green-950/10"
                    : ""
              }
            >
              <CardContent className="flex items-start gap-4 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs">
                      {ev.evidence_type}
                    </Badge>
                    {approved && (
                      <Badge
                        variant="outline"
                        className="border-green-500 text-green-700 dark:text-green-400 text-xs"
                      >
                        <Check className="mr-1 h-3 w-3" />
                        已确认
                      </Badge>
                    )}
                    {!approved && !excluded && ev.category === "uncertain" && (
                      <Badge
                        variant="outline"
                        className="border-yellow-500 text-yellow-700 dark:text-yellow-400 text-xs"
                      >
                        待确认
                      </Badge>
                    )}
                    {/* Scene label */}
                    {ev.scene_id && scenes.length > 0 && (
                      <Badge
                        variant="outline"
                        className="text-xs border-blue-500 text-blue-700 dark:text-blue-400"
                      >
                        {scenes.find((s) => s.id === ev.scene_id)?.name || `场景 #${ev.scene_id}`}
                      </Badge>
                    )}
                  </div>

                  <p
                    className={
                      excluded ? "line-through text-muted-foreground" : ""
                    }
                  >
                    {ev.description}
                  </p>

                  {states.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {states.map((s) => (
                        <Badge
                          key={s}
                          variant="secondary"
                          className="text-xs"
                        >
                          {s}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {showActions && (
                    <div className="mt-2 flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      <Select
                        value={ev.location || "on_floor"}
                        onValueChange={(v) =>
                          handleLocationChange(ev.id, v)
                        }
                      >
                        <SelectTrigger className="h-7 w-[160px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LOCATION_KEYS.map((lk) => (
                            <SelectItem key={lk.value} value={lk.value}>
                              {lk.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {/* Scene selector */}
                      <Select
                        value={ev.scene_id ? String(ev.scene_id) : "__unassigned__"}
                        onValueChange={(v) =>
                          handleUpdate(ev.id, {
                            scene_id: v === "__unassigned__" ? null : Number(v),
                          })
                        }
                      >
                        <SelectTrigger className="h-7 w-[140px] text-xs">
                          <SelectValue placeholder="未分配" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__unassigned__">未分配</SelectItem>
                          {scenes.map((s) => (
                            <SelectItem key={s.id} value={String(s.id)}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Document render button for 书证 / 电子数据 */}
                  {showActions && !excluded && (ev.evidence_type === "书证" || ev.evidence_type === "电子数据") && (
                    <div className="mt-2">
                      {docFormExpanded.has(ev.id) ? (
                        <DocumentTemplateForm
                          evidenceId={ev.id}
                          caseId={Number(caseId)}
                          defaultTitle={ev.description.slice(0, 30)}
                          defaultText={ev.description}
                          suggestedTemplate={
                            ev.description.includes("聊天") || ev.description.includes("微信") || ev.description.includes("短信")
                              ? "chat_screenshot"
                              : ev.description.includes("通话")
                              ? "a4_document"
                              : ev.evidence_type === "电子数据"
                              ? "a4_document"
                              : undefined
                          }
                          onSuccess={(_img) => {
                            // Keep form open so user can see the preview
                          }}
                          onClose={() => {
                            setDocFormExpanded((prev) => {
                              const next = new Set(prev)
                              next.delete(ev.id)
                              return next
                            })
                          }}
                        />
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() =>
                            setDocFormExpanded((prev) => new Set(prev).add(ev.id))
                          }
                        >
                          <FileText className="mr-1 h-3.5 w-3.5" />
                          {ev.evidence_type === "电子数据" ? "渲染电子数据" : "渲染书证"}
                        </Button>
                      )}
                    </div>
                  )}

                  {/* AI injury closeup button for injury-related evidence */}
                  {showActions && !excluded && isInjuryEvidence(ev) && (
                    <div className="mt-2">
                      {injuryFormExpanded.has(ev.id) ? (
                        <InjuryCloseupForm
                          evidenceId={ev.id}
                          caseId={Number(caseId)}
                          defaultDescription={ev.description}
                          onSuccess={(_img) => {
                            setInjuryFormExpanded((prev) => {
                              const next = new Set(prev)
                              next.delete(ev.id)
                              return next
                            })
                          }}
                        />
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() =>
                            setInjuryFormExpanded((prev) => new Set(prev).add(ev.id))
                          }
                        >
                          <ZoomIn className="mr-1 h-3.5 w-3.5" />
                          AI 伤情特写
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {showActions && !excluded && (
                  <div className="flex flex-col gap-1.5 shrink-0">
                    {!approved && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-green-500 text-green-700 dark:text-green-400"
                        onClick={() => handleApprove(ev.id)}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" />
                        确认
                      </Button>
                    )}
                    {approved && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={() => handleExclude(ev.id)}
                      >
                        <EyeOff className="mr-1 h-3.5 w-3.5" />
                        排除
                      </Button>
                    )}
                    {!approved && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-destructive"
                        onClick={() => handleExclude(ev.id)}
                      >
                        <EyeOff className="mr-1 h-3.5 w-3.5" />
                        排除
                      </Button>
                    )}
                  </div>
                )}

                {showActions && excluded && (
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-amber-500 text-amber-700 dark:text-amber-400"
                      onClick={() => handleApprove(ev.id)}
                    >
                      <RefreshCw className="mr-1 h-3.5 w-3.5" />
                      恢复
                    </Button>
                  </div>
                )}

                {!showActions && (
                  <Eye className="mt-1 h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{caseTitle}</h1>
          <p className="text-muted-foreground">
            证据审核 —{" "}
            {statusLabels[caseStatus] || caseStatus}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate({
                to: "/cases/$caseId/scenes",
                params: { caseId },
              })
            }
          >
            <Layers className="mr-1 h-4 w-4" />
            场景管理
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBuildScene}
            disabled={building || extractable.filter((e) => e.is_approved).length === 0}
          >
            {building ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Image className="mr-2 h-4 w-4" />
            )}
            {building ? "构建中..." : "生成场景状态"}
          </Button>
          <Button
            onClick={() =>
              navigate({
                to: "/cases/$caseId/generate",
                params: { caseId },
              })
            }
            variant="outline"
            size="sm"
          >
            前往生成图片
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Tabs defaultValue="extractable">
        <TabsList className="grid w-full grid-cols-3 bg-muted border border-border/30">
          <TabsTrigger value="extractable" className="flex items-center gap-2">
            🟢 可视化证据
            <Badge variant="secondary" className="ml-1 text-xs">
              {extractable.filter((e) => e.is_approved).length}/
              {extractable.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="uncertain" className="flex items-center gap-2">
            🟡 待确认证据
            <Badge variant="secondary" className="ml-1 text-xs">
              {uncertain.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="non_visualizable" className="flex items-center gap-2">
            🔴 不可视化内容
            <Badge variant="secondary" className="ml-1 text-xs">
              {nonVisual.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="extractable" className="mt-4">
          {renderEvidenceList(extractable, true)}
        </TabsContent>

        <TabsContent value="uncertain" className="mt-4">
          {renderEvidenceList(uncertain, true)}
        </TabsContent>

        <TabsContent value="non_visualizable" className="mt-4">
          {renderEvidenceList(nonVisual, true)}
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Export via Route only (TanStack Router file-based routing)
