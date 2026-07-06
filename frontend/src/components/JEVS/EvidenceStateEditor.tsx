import { useEffect, useState } from "react"

import { GlassCard } from "@/components/ui/GlassCard"
import { AppleButton } from "@/components/ui/AppleButton"

// ==============================================================================
// Types
// ==============================================================================

interface StateLabel {
  key: string
  label_zh: string
  prompt_en: string
}

interface EvidenceStateEditorProps {
  evidenceId: number
  initialStateJson: string | null
  onSave: (newStateJson: string) => void
}

// ==============================================================================
// Constants
// ==============================================================================

const STATE_GROUPS = [
  {
    label: "血迹",
    keys: ["bloody", "blood_spatter", "blood_pooled"],
  },
  {
    label: "破损",
    keys: ["broken", "cracked", "shattered", "dented", "scratched", "punctured", "pierced", "torn"],
  },
  {
    label: "位置/状态",
    keys: ["open", "overturned", "scattered", "displaced", "fallen", "tipped_over", "spilled", "empty"],
  },
  {
    label: "其他",
    keys: ["burned", "wet", "torn", "wrinkled", "stained", "dirty", "evidence_tagged", "fingerprints", "photographed"],
  },
]

// ==============================================================================
// Component
// ==============================================================================

/**
 * 物证状态编辑器。
 * 支持预设状态标签（复选框）+ 自定义文本描述。
 */
export function EvidenceStateEditor({
  evidenceId: _evidenceId,
  initialStateJson,
  onSave,
}: EvidenceStateEditorProps) {
  const [stateLabels, setStateLabels] = useState<StateLabel[]>([])
  const [checkedStates, setCheckedStates] = useState<Record<string, boolean>>({})
  const [initialChecked, setInitialChecked] = useState<Record<string, boolean>>({})
  const [customDesc, setCustomDesc] = useState("")
  const [initialCustom, setInitialCustom] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // 初始化：解析 initialStateJson
  useEffect(() => {
    if (initialStateJson) {
      try {
        const state = JSON.parse(initialStateJson)
        const checked: Record<string, boolean> = {}
        let custom = ""
        for (const [k, v] of Object.entries(state)) {
          if (k === "custom" && typeof v === "string") {
            custom = v
          } else if (v) {
            checked[k] = true
          }
        }
        setCheckedStates(checked)
        setInitialChecked({ ...checked })
        setCustomDesc(custom)
        setInitialCustom(custom)
      } catch {
        // ignore parse errors
      }
    }
  })

  // 加载标签列表
  useEffect(() => {
    const token = localStorage.getItem("access_token")
    fetch("/api/v1/state-labels", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(data => {
        if (data.labels) setStateLabels(data.labels)
      })
      .catch(() => {
        // fallback silently
      })
  })

  const handleSave = async () => {
    setSaving(true)
    const state: Record<string, unknown> = { ...checkedStates }
    if (customDesc.trim()) state.custom = customDesc.trim()
    onSave(JSON.stringify(state))
    setSaving(false)
    setIsOpen(false)
  }

  // 只计算用户新增的状态（排除初始就有的），无新增时不显示红点
  const userAddedCount =
    Object.keys(checkedStates).filter(k => checkedStates[k] && !initialChecked[k]).length
    + (customDesc.trim() && customDesc.trim() !== initialCustom ? 1 : 0)

  // 显示当前状态的简要摘要（折叠时显示）
  const activeLabels = Object.keys(checkedStates)
    .filter(k => checkedStates[k])
    .map(k => {
      const label = stateLabels.find(l => l.key === k)
      return label?.label_zh || k
    })
  if (customDesc.trim()) activeLabels.push(`"${customDesc.trim().slice(0, 10)}..."`)

  const summary = activeLabels.length > 0 ? activeLabels.join(" · ") : "（未设置）"

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="text-xs text-apple-accent hover:underline flex items-center gap-1 transition-colors"
      >
        🏷️ 状态：{summary}
        {userAddedCount > 0 && (
          <span className="inline-flex items-center rounded-full bg-destructive/10 text-destructive px-1.5 py-0.5 text-[10px] font-medium border border-destructive/30">
            {userAddedCount}
          </span>
        )}
        <span className="text-apple-text-tertiary">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <GlassCard hover className="mt-2 p-3 space-y-3">
          {/* 预设状态复选框（按组显示）*/}
          {STATE_GROUPS.map(group => {
            const availableKeys = group.keys.filter(k =>
              stateLabels.some(l => l.key === k)
            )
            if (availableKeys.length === 0) return null
            return (
              <div key={group.label}>
                <p className="text-xs font-medium text-apple-text-secondary mb-1">{group.label}</p>
                <div className="flex flex-wrap gap-2">
                  {availableKeys.map(key => {
                    const label = stateLabels.find(l => l.key === key)!
                    return (
                      <label
                        key={key}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                          text-xs cursor-pointer border transition-colors
                          ${checkedStates[key]
                            ? "bg-destructive/10 backdrop-blur-sm border border-destructive/30 text-destructive"
                            : "bg-apple-glass-bg/40 border border-apple-glass-border/40 text-apple-text-secondary"
                          }`}
                      >
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={!!checkedStates[key]}
                          onChange={e => setCheckedStates(prev => ({
                            ...prev,
                            [key]: e.target.checked,
                          }))}
                        />
                        {checkedStates[key] ? "✓ " : ""}{label.label_zh}
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* 自定义状态描述 */}
          <div>
            <p className="text-xs font-medium text-apple-text-secondary mb-1">
              自定义状态描述（直接注入图像生成 prompt）
            </p>
            <input
              type="text"
              value={customDesc}
              onChange={e => setCustomDesc(e.target.value)}
              placeholder="例：啤酒瓶碎片散落在茶几半径30cm内"
              className="w-full text-xs p-2 rounded-xl border border-apple-glass-border/50 bg-apple-glass-bg/70 backdrop-blur-sm text-apple-text-primary placeholder:text-apple-text-tertiary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/40 transition-all duration-200"
              maxLength={100}
            />
            <p className="text-xs text-apple-text-tertiary mt-0.5">
              用客观名词短语描述视觉状态，此文本会写入 prompt
            </p>
          </div>

          <div className="flex gap-2">
            <AppleButton
              size="sm"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "保存中..." : "保存状态"}
            </AppleButton>
            <AppleButton
              size="sm"
              variant="outline"
              onClick={() => setIsOpen(false)}
            >
              取消
            </AppleButton>
          </div>
        </GlassCard>
      )}
    </div>
  )
}
