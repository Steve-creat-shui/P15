import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  Layers,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { jevx } from "@/lib/jevx"

// ==============================================================================
// Constants
// ==============================================================================

const ROOM_TYPE_OPTIONS = [
  { value: "bedroom", label: "卧室" },
  { value: "living_room", label: "客厅" },
  { value: "reception_room", label: "接待室" },
  { value: "kitchen", label: "厨房" },
  { value: "bathroom", label: "浴室/卫生间" },
  { value: "office", label: "办公室" },
  { value: "conference_room", label: "会议室" },
  { value: "hallway", label: "走廊/楼道" },
  { value: "garage", label: "车库" },
  { value: "warehouse", label: "仓库" },
  { value: "balcony", label: "阳台" },
  { value: "outdoor", label: "户外" },
  { value: "unknown", label: "未知/其他" },
]

// ==============================================================================
// Types
// ==============================================================================

interface SceneData {
  id: number
  case_id: number
  name: string
  room_type: string
  sort_order: number
  evidence_count: number
  created_at: string
  updated_at: string
}

interface Suggestion {
  name: string
  room_type: string
  reason: string
}

// ==============================================================================
// Component
// ==============================================================================

export const Route = createFileRoute("/_layout/cases/$caseId/scenes")({
  component: SceneManagement,
  head: () => ({
    meta: [{ title: "场景管理 - JEVS" }],
  }),
})

function SceneManagement() {
  const { caseId } = useParams({ from: "/_layout/cases/$caseId/scenes" })
  const [caseTitle, setCaseTitle] = useState("")
  const [caseStatus, setCaseStatus] = useState("")
  const [styleDescription, setStyleDescription] = useState("")
  const [savingStyle, setSavingStyle] = useState(false)
  const [scenes, setScenes] = useState<SceneData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // Auto-suggest dialog
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [suggesting, setSuggesting] = useState(false)
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set())

  // Manual add
  const [newName, setNewName] = useState("")
  const [newRoomType, setNewRoomType] = useState("unknown")
  const [adding, setAdding] = useState(false)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<SceneData | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [sceneList, projects] = await Promise.all([
        jevx.getScenes(Number(caseId)),
        jevx.getProjects(),
      ])
      setScenes(sceneList as SceneData[])
      const current = projects.find((p) => p.id === Number(caseId))
      if (current) {
        setCaseTitle(current.title)
        setCaseStatus(current.status)
        setStyleDescription(current.style_description || "")
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

  // ---- Auto-suggest ----
  const handleSuggest = async () => {
    setSuggesting(true)
    try {
      const res = (await jevx.suggestScenes(Number(caseId))) as {
        suggestions: Suggestion[]
      }
      setSuggestions(res.suggestions)
      setSelectedSuggestions(new Set(res.suggestions.map((_, i) => i)))
      setSuggestOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取建议失败")
    } finally {
      setSuggesting(false)
    }
  }

  const handleBatchCreate = async () => {
    setSuggesting(true)
    try {
      for (const idx of selectedSuggestions) {
        const s = suggestions[idx]
        await jevx.createScene(Number(caseId), {
          name: s.name,
          room_type: s.room_type,
        })
      }
      setSuggestOpen(false)
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败")
    } finally {
      setSuggesting(false)
    }
  }

  // ---- Manual add ----
  const handleAdd = async () => {
    if (!newName.trim()) return
    setAdding(true)
    try {
      await jevx.createScene(Number(caseId), {
        name: newName.trim(),
        room_type: newRoomType,
      })
      setNewName("")
      setNewRoomType("unknown")
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败")
    } finally {
      setAdding(false)
    }
  }

  // ---- Update scene name / room type ----
  const handleUpdateName = async (id: number, name: string) => {
    if (!name.trim()) return
    try {
      await jevx.updateScene(id, { name })
    } catch {
      // silently revert on failure
    }
  }

  const handleUpdateRoomType = async (id: number, room_type: string) => {
    try {
      await jevx.updateScene(id, { room_type })
    } catch {
      // silently revert on failure
    }
  }

  // ---- Delete ----
  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await jevx.deleteScene(deleteTarget.id)
      setDeleteTarget(null)
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败")
      setDeleteTarget(null)
    }
  }

  // ---- Reorder ----
  const handleMove = async (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= scenes.length) return
    const reordered = [...scenes]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    setScenes(reordered)
    try {
      await jevx.reorderScenes(
        Number(caseId),
        reordered.map((s) => s.id),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "排序失败")
      await fetchData() // revert
    }
  }

  // ---- Render helpers ----
  const roomTypeLabel = (rt: string) =>
    ROOM_TYPE_OPTIONS.find((o) => o.value === rt)?.label ?? rt

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/cases" className="hover:text-foreground">
          案件列表
        </Link>
        <ChevronLeft className="h-3 w-3 rotate-180" />
        <Link
          to="/cases/$caseId/evidence"
          params={{ caseId }}
          className="hover:text-foreground"
        >
          {caseTitle}
        </Link>
        <ChevronLeft className="h-3 w-3 rotate-180" />
        <span className="text-foreground">场景管理</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Layers className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">场景管理</h1>
            <p className="text-muted-foreground">
              创建和管理案件的多个场景，将证据分配到对应场景
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSuggest} disabled={suggesting}>
            <Sparkles className="mr-2 h-4 w-4" />
            {suggesting ? "分析中..." : "🤖 自动建议场景"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
          <Button
            variant="link"
            size="sm"
            className="ml-2 h-auto p-0"
            onClick={() => setError("")}
          >
            关闭
          </Button>
        </div>
      )}

      {/* Case Style Description Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            🎨 环境/装修风格描述
            <Badge variant="secondary" className="text-xs font-normal">跨场景共享</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            描述这起案件发生的整体环境（如公寓装修、地板颜色、家具风格）。
            设置后将自动注入到所有场景和特写图中，确保背景风格一致。
          </p>
        </CardHeader>
        <CardContent>
          <textarea
            className="w-full min-h-[80px] rounded-md border px-3 py-2 text-sm resize-y"
            placeholder="例如：一栋老式居民楼的公寓单元，浅橡木地板，白色墙面，灰色布艺沙发，简约装修风格，楼层走廊铺白色地砖"
            value={styleDescription}
            onChange={(e) => setStyleDescription(e.target.value)}
            onBlur={async () => {
              // 防抖保存
              setSavingStyle(true)
              try {
                await jevx.updateCase(Number(caseId), {
                  style_description: styleDescription || null,
                })
              } catch (err) {
                // 静默失败，不阻塞
                console.error("保存风格描述失败:", err)
              } finally {
                setSavingStyle(false)
              }
            }}
          />
          <div className="mt-1.5 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {savingStyle ? "保存中..." : "失焦自动保存 · 留空则不启用"}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={!styleDescription}
              onClick={async () => {
                setSavingStyle(true)
                try {
                  await jevx.updateCase(Number(caseId), {
                    style_description: null,
                  })
                  setStyleDescription("")
                } catch (err) {
                  console.error("清除风格描述失败:", err)
                } finally {
                  setSavingStyle(false)
                }
              }}
            >
              清除
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Manual add form */}
      <Card className="border-dashed">
        <CardContent className="flex items-end gap-3 py-4">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">场景名称</Label>
            <Input
              placeholder="如：卧室、接待室"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              disabled={adding}
            />
          </div>
          <div className="w-44 space-y-1.5">
            <Label className="text-xs">房间类型</Label>
            <Select value={newRoomType} onValueChange={setNewRoomType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROOM_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAdd} disabled={adding || !newName.trim()}>
            <Plus className="mr-1 h-4 w-4" />
            添加
          </Button>
        </CardContent>
      </Card>

      {/* Scene list */}
      {scenes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <Layers className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-muted-foreground">暂无场景，请使用自动建议或手动添加</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {scenes.map((scene, idx) => (
            <Card key={scene.id}>
              <CardContent className="flex items-center gap-4 py-4">
                {/* Name (inline editable) */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <Input
                    className="text-base font-semibold h-9 border-transparent bg-transparent px-0 focus-visible:border-input focus-visible:bg-background"
                    value={scene.name}
                    onChange={(e) => {
                      setScenes((prev) =>
                        prev.map((s) =>
                          s.id === scene.id ? { ...s, name: e.target.value } : s,
                        ),
                      )
                    }}
                    onBlur={(e) => handleUpdateName(scene.id, e.target.value)}
                  />
                  <div className="flex items-center gap-3">
                    <Select
                      value={scene.room_type}
                      onValueChange={(v) => {
                        setScenes((prev) =>
                          prev.map((s) =>
                            s.id === scene.id ? { ...s, room_type: v } : s,
                          ),
                        )
                        handleUpdateRoomType(scene.id, v)
                      }}
                    >
                      <SelectTrigger className="h-7 w-[160px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROOM_TYPE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Badge variant="secondary" className="text-xs">
                      {scene.evidence_count} 项证据
                    </Badge>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={idx === 0}
                    onClick={() => handleMove(idx, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={idx === scenes.length - 1}
                    onClick={() => handleMove(idx, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => setDeleteTarget(scene)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Bottom action */}
      <div className="flex justify-end">
        <Button asChild>
          <Link
            to="/cases/$caseId/evidence"
            params={{ caseId }}
          >
            下一步：分配证据到场景
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* ---- Auto-suggest Dialog ---- */}
      <Dialog open={suggestOpen} onOpenChange={setSuggestOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>🤖 自动建议场景</DialogTitle>
            <p className="text-sm text-muted-foreground">
              系统根据案件文本中的关键词检测到以下场景建议，勾选需要创建的场景后点击确认。
            </p>
          </DialogHeader>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {suggestions.map((s, i) => (
              <label
                key={`${s.name}-${s.room_type}`}
                className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent"
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selectedSuggestions.has(i)}
                  onChange={(e) => {
                    setSelectedSuggestions((prev) => {
                      const next = new Set(prev)
                      if (e.target.checked) next.add(i)
                      else next.delete(i)
                      return next
                    })
                  }}
                />
                <div>
                  <div className="font-medium">
                    {s.name}{" "}
                    <Badge variant="outline" className="ml-2 text-xs">
                      {roomTypeLabel(s.room_type)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {s.reason}
                  </p>
                </div>
              </label>
            ))}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSuggestOpen(false)}
            >
              取消
            </Button>
            <Button
              onClick={handleBatchCreate}
              disabled={selectedSuggestions.size === 0 || suggesting}
            >
              {suggesting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              批量创建已选场景
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Delete confirm Dialog ---- */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除场景？</DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <p className="text-sm text-muted-foreground">
              {deleteTarget.evidence_count > 0
                ? `该场景「${deleteTarget.name}」下有 ${deleteTarget.evidence_count} 项证据将被解除绑定，确认删除？`
                : `确认删除场景「${deleteTarget.name}」？`}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
