import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"
import { motion } from "motion/react"
import { useCallback, useRef, useState } from "react"

const MotionDiv = motion.div
const MotionIcon = motion.svg

interface AppleUploadProps {
  onFileSelect: (file: File) => void
  accept?: string
  label?: string
  description?: string
  loading?: boolean
  progress?: number
  className?: string
}

/**
 * Hero Apple-style drag-and-drop upload component.
 *
 * Features:
 * - Frosted glass card with inner highlight border
 * - Animated dashed border ring (rotating gradient on hover)
 * - Bouncing icon on hover (spring physics)
 * - Scale-up + border color shift on drag-over
 * - Smooth progress bar animation
 * - Fully controlled via props
 */
export function AppleUpload({
  onFileSelect,
  accept,
  label = "拖放文件到这里",
  description = "支持 .txt / .pdf / .docx 文件",
  loading = false,
  progress = 0,
  className,
}: AppleUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    (file: File) => {
      if (!loading) {
        onFileSelect(file)
      }
    },
    [loading, onFileSelect],
  )

  const handleClick = () => {
    if (!loading) {
      inputRef.current?.click()
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // Reset so the same file can be selected again
    if (inputRef.current) inputRef.current.value = ""
  }

  const springConfig = { type: "spring" as const, stiffness: 400, damping: 12 }

  return (
    <MotionDiv
      data-slot="apple-upload"
      className={cn(
        "relative overflow-hidden rounded-2xl border-2 border-dashed",
        "transition-all duration-300 ease-out",
        // Idle: warm glass card style
        "border-apple-glass-border/50 bg-apple-glass-bg/70 backdrop-blur-xl",
        "shadow-[var(--apple-glass-shadow)]",
        // Hover state
        "hover:border-apple-accent/40 hover:shadow-[var(--apple-glass-shadow-lg)]",
        // Drag-over state
        isDragOver &&
          "border-solid border-apple-accent bg-apple-accent-soft/40 shadow-[0_0_0_3px_var(--apple-accent-glow)] scale-[1.02]",
        loading && "pointer-events-none opacity-80",
        className,
      )}
      onClick={handleClick}
      onDragOver={(e) => {
        e.preventDefault()
        if (!loading) setIsDragOver(true)
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      whileHover={{ scale: 1.005 }}
      whileTap={!loading ? { scale: 0.995 } : undefined}
      transition={{ type: "spring" as const, stiffness: 300, damping: 25 }}
    >
      {/* Rotating gradient border pseudo-element */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 rounded-xl",
          "opacity-0 transition-opacity duration-500",
          "hover:opacity-100",
          isDragOver && "opacity-100",
        )}
        style={{
          padding: "2px",
          mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          maskComposite: "exclude",
          WebkitMaskComposite: "source-out",
          background: isDragOver
            ? "conic-gradient(from var(--angle, 0deg), var(--apple-accent-start), transparent 60%, var(--apple-accent-end))"
            : "conic-gradient(from var(--angle, 0deg), var(--apple-accent-soft), transparent 70%, var(--apple-accent-soft))",
          animation: "spin-border 4s linear infinite",
        }}
      />

      <style>{`
        @property --angle {
          syntax: "<angle>";
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes spin-border {
          to { --angle: 360deg; }
        }
      `}</style>

      <div className="flex flex-col items-center gap-4 py-10 px-6 text-center">
        {/* Animated icon */}
        <MotionIcon
          className="h-12 w-12 text-apple-text-tertiary"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          whileHover={{ y: -4, rotate: -8 }}
          transition={springConfig}
        >
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          <path d="M12 12v6" />
          <path d="m15 15-3-3-3 3" />
        </MotionIcon>

        {/* Text */}
        <div className="space-y-1">
          <p className="text-sm font-medium text-apple-text-primary">
            {label}
          </p>
          <p className="text-xs text-apple-text-tertiary">
            {description}
          </p>
        </div>

        {/* Browse button */}
        {!loading && (
          <span className="inline-flex items-center rounded-full border border-apple-glass-border/60 bg-apple-glass-bg px-3 py-1 text-xs font-medium text-apple-text-secondary transition-colors hover:border-apple-accent/40 hover:text-apple-accent">
            点击浏览
          </span>
        )}

        {/* Progress bar */}
        {loading && (
          <div className="mt-2 w-full max-w-xs space-y-1.5">
            <div className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-apple-accent" />
              <span className="text-xs text-apple-text-secondary">
                {progress < 100 ? "处理中..." : "已完成"}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-apple-glass-border/30">
              <motion.div
                className="h-full rounded-full bg-apple-accent"
                initial={{ width: "0%" }}
                animate={{ width: `${progress}%` }}
                transition={{
                  duration: 0.5,
                  ease: [0.4, 0, 0.2, 1],
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleInputChange}
      />
    </MotionDiv>
  )
}
