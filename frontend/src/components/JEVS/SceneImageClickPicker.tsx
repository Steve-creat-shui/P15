import { useState } from "react"

// ==============================================================================
// Types
// ==============================================================================

interface SceneImageClickPickerProps {
  sceneImagePath: string
  onPick: (x: number, y: number) => void
}

// ==============================================================================
// Component
// ==============================================================================

/**
 * 场景图点击选择器。
 * 用户点击场景图，返回点击位置的相对坐标（0-1）。
 *
 * sceneImagePath 应该是已解析后的完整 URL（由父组件调用 imageUrl() 得到），
 * 本组件不自行拼装 URL，避免路径不一致。
 */
export function SceneImageClickPicker({ sceneImagePath, onPick }: SceneImageClickPickerProps) {
  const [clickPos, setClickPos] = useState<{ x: number; y: number } | null>(null)

  const handleClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    const rounded = { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }
    setClickPos(rounded)
    onPick(x, y)
  }

  return (
    <div className="relative">
      <img
        src={sceneImagePath}
        alt="点击标记物证位置"
        className="w-full rounded-2xl border-2 border-dashed border-apple-glass-border/60 cursor-crosshair"
        onClick={handleClick}
        onError={(e) => {
          const target = e.currentTarget
          target.style.display = "none"
          const parent = target.parentElement
          if (parent) {
            const msg = document.createElement("p")
            msg.className = "text-xs text-destructive text-center py-4"
            msg.textContent = "图片加载失败，请确认场景图已生成"
            parent.prepend(msg)
          }
        }}
      />
      {clickPos && (
        <div
          className="absolute w-4 h-4 bg-apple-accent/80 border-2 border-white shadow-[0_2px_8px_rgba(0,0,0,0.25)] rounded-full"
          style={{
            left: `${clickPos.x * 100}%`,
            top: `${clickPos.y * 100}%`,
            transform: "translate(-50%, -50%)",
            pointerEvents: "none" as const,
          }}
        />
      )}
      <p className="text-xs text-apple-accent mt-1 text-center">
        👆 点击图片中物证所在位置
        {clickPos && ` → 已标记 (${clickPos.x}, ${clickPos.y})`}
      </p>
    </div>
  )
}
