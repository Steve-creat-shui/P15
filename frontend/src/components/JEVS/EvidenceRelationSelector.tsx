import { useState, useMemo } from "react"

import { GlassCard } from "@/components/ui/GlassCard"
import { AppleButton } from "@/components/ui/AppleButton"
import {
  AppleSelect,
  AppleSelectContent,
  AppleSelectItem,
  AppleSelectTrigger,
  AppleSelectValue,
} from "@/components/ui/apple/AppleSelect"

// ==============================================================================
// Constants
// ==============================================================================

const RELATION_OPTIONS = [
  { value: "", label: "（无关联）" },
  { value: "inside", label: "在...内部" },
  { value: "on_top", label: "在...上面" },
  { value: "next_to", label: "紧邻..." },
  { value: "under", label: "在...下面" },
  { value: "spilled_from", label: "从...溢出" },
  { value: "broken_into", label: "碎裂自..." },
  { value: "stained_with", label: "被...染色" },
  { value: "attached_to", label: "附着在...上" },
]

// ==============================================================================
// Types
// ==============================================================================

interface EvidenceRelationSelectorProps {
  evidenceId: number
  currentRelatedId: number | null
  currentRelationType: string | null
  allEvidences: Array<{ id: number; description: string }>
  onSave: (relatedId: number | null, relationType: string | null) => void
}

// ==============================================================================
// Component
// ==============================================================================

/**
 * 物证关联关系选择器。
 * 让教师指定"A 与 B 的关系"，用于生成精确的 prompt。
 */
export function EvidenceRelationSelector({
  evidenceId,
  currentRelatedId,
  currentRelationType,
  allEvidences,
  onSave,
}: EvidenceRelationSelectorProps) {
  const [relatedId, setRelatedId] = useState<number | null>(currentRelatedId)
  const [relationType, setRelationType] = useState<string | null>(currentRelationType)

  // 过滤掉自身
  const otherEvidences = allEvidences.filter(e => e.id !== evidenceId)

  // 当前选中的关联物证描述
  const relatedDesc = useMemo(() => {
    if (!relatedId) return null
    const found = otherEvidences.find(e => e.id === relatedId)
    return found ? found.description.slice(0, 15) : null
  }, [relatedId, otherEvidences])

  // 关系描述预览
  const previewText = useMemo(() => {
    if (!relatedId || !relationType || !relatedDesc) return null
    const rel = RELATION_OPTIONS.find(r => r.value === relationType)
    const label = rel?.label?.replace("...", `"${relatedDesc}"`) || relationType
    return `当前物证 ${label}`
  }, [relatedId, relationType, relatedDesc])

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-apple-text-tertiary whitespace-nowrap">关联：</span>
        <AppleSelect value={relatedId?.toString() ?? ""} onValueChange={v => setRelatedId(v ? Number(v) : null)}>
          <AppleSelectTrigger className="w-[160px] text-xs">
            <AppleSelectValue placeholder="（无关联）" />
          </AppleSelectTrigger>
          <AppleSelectContent>
            <AppleSelectItem value="">（无关联）</AppleSelectItem>
            {otherEvidences.map(ev => (
              <AppleSelectItem key={ev.id} value={ev.id.toString()}>
                {ev.description.slice(0, 15)}{ev.description.length > 15 ? "..." : ""}
              </AppleSelectItem>
            ))}
          </AppleSelectContent>
        </AppleSelect>

        {relatedId && (
          <>
            <span className="text-xs text-apple-text-tertiary whitespace-nowrap">关系：</span>
            <AppleSelect value={relationType ?? ""} onValueChange={v => setRelationType(v || null)}>
              <AppleSelectTrigger className="text-xs">
                <AppleSelectValue placeholder="选择关系" />
              </AppleSelectTrigger>
              <AppleSelectContent>
                {RELATION_OPTIONS.map(opt => (
                  <AppleSelectItem key={opt.value} value={opt.value}>{opt.label}</AppleSelectItem>
                ))}
              </AppleSelectContent>
            </AppleSelect>
          </>
        )}

        <AppleButton
          size="sm"
          onClick={() => onSave(relatedId, relationType)}
        >
          保存
        </AppleButton>
      </div>

      {previewText && (
        <GlassCard className="px-3 py-2">
          <p className="text-xs text-apple-accent font-medium">
            Prompt 关系：{previewText}
          </p>
        </GlassCard>
      )}
    </div>
  )
}
