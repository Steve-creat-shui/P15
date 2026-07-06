import { createContext, useContext, useEffect, useState, useCallback } from "react"

const THEME_KEY = "jevs-theme"

const ALL_VARS = [
  "--background","--apple-bg","--sidebar","--card","--popover","--secondary","--muted","--accent",
  "--foreground","--card-foreground","--popover-foreground","--secondary-foreground","--muted-foreground","--accent-foreground",
  "--sidebar-foreground","--sidebar-primary-foreground","--sidebar-accent","--sidebar-accent-foreground","--sidebar-border","--sidebar-ring",
  "--apple-text-primary","--apple-text-secondary","--apple-text-tertiary","--apple-bg-foreground",
  "--apple-glass-bg","--apple-glass-bg-hover","--apple-glass-border","--apple-glass-highlight","--apple-glass-shadow","--apple-glass-shadow-lg",
  "--apple-accent","--apple-accent-hover","--apple-accent-start","--apple-accent-end","--apple-accent-hover-start","--apple-accent-hover-end","--apple-accent-soft","--apple-accent-glow","--apple-accent-glow-start","--apple-accent-glow-end",
  "--primary","--sidebar-primary","--primary-foreground",
  "--border","--input","--ring","--destructive",
  "--chart-1","--chart-2","--chart-3","--chart-4","--chart-5",
] as const

type ThemeKey = "warm" | "cool" | "blueviolet"

interface ThemeContextValue {
  currentTheme: ThemeKey
  setTheme: (theme: ThemeKey) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  currentTheme: "blueviolet",
  setTheme: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

const themeStyles: Record<ThemeKey, Record<string, string>> = {
  warm: {
    "--background": "oklch(0.96 0.02 50)",
    "--apple-bg": "oklch(0.96 0.02 50)",
    "--sidebar": "oklch(0.93 0.02 50)",
    "--card": "oklch(1 0 0)",
    "--popover": "oklch(1 0 0)",
    "--secondary": "oklch(0.94 0.02 50)",
    "--muted": "oklch(0.94 0.02 50)",
    "--accent": "oklch(0.94 0.02 50)",
    "--foreground": "oklch(0.12 0.01 50)",
    "--card-foreground": "oklch(0.12 0.01 50)",
    "--popover-foreground": "oklch(0.12 0.01 50)",
    "--secondary-foreground": "oklch(0.25 0.02 50)",
    "--muted-foreground": "oklch(0.35 0.02 50)",
    "--accent-foreground": "oklch(0.25 0.02 50)",
    "--sidebar-foreground": "oklch(0.2 0.02 50)",
    "--sidebar-primary-foreground": "oklch(1 0 0)",
    "--sidebar-accent": "oklch(0.9 0.02 50)",
    "--sidebar-accent-foreground": "oklch(0.3 0.02 50)",
    "--sidebar-border": "oklch(0.85 0.02 50)",
    "--sidebar-ring": "oklch(0.6 0.15 50)",
    "--apple-text-primary": "oklch(0.12 0.01 50)",
    "--apple-text-secondary": "oklch(0.30 0.02 50)",
    "--apple-text-tertiary": "oklch(0.42 0.02 50)",
    "--apple-bg-foreground": "oklch(0.2 0.02 50)",
    "--apple-glass-bg": "oklch(0.97 0.01 50 / 0.85)",
    "--apple-glass-bg-hover": "oklch(0.93 0.01 50 / 0.9)",
    "--apple-glass-border": "oklch(0.78 0.02 50 / 0.7)",
    "--apple-glass-highlight": "oklch(1 0 0 / 0.95)",
    "--apple-accent": "oklch(0.55 0.18 50)",
    "--apple-accent-hover": "oklch(0.48 0.18 50)",
    "--apple-accent-start": "oklch(0.55 0.18 50)",
    "--apple-accent-end": "oklch(0.60 0.18 65)",
    "--apple-accent-hover-start": "oklch(0.48 0.18 50)",
    "--apple-accent-hover-end": "oklch(0.53 0.18 65)",
    "--apple-accent-soft": "oklch(0.90 0.06 55)",
    "--apple-accent-glow": "oklch(0.55 0.18 50 / 0.25)",
    "--apple-accent-glow-start": "oklch(0.55 0.18 50 / 0.25)",
    "--apple-accent-glow-end": "oklch(0.60 0.18 65 / 0.2)",
    "--primary": "oklch(0.55 0.18 50)",
    "--sidebar-primary": "oklch(0.55 0.18 50)",
    "--border": "oklch(0.80 0.02 50)",
    "--input": "oklch(0.80 0.02 50)",
    "--ring": "oklch(0.65 0.10 50)",
    "--primary-foreground": "oklch(1 0 0)",
    "--destructive": "oklch(0.5 0.22 27)",
    "--chart-1": "oklch(0.60 0.18 50)",
    "--chart-2": "oklch(0.55 0.15 35)",
    "--chart-3": "oklch(0.50 0.12 20)",
    "--chart-4": "oklch(0.65 0.15 65)",
    "--chart-5": "oklch(0.55 0.18 80)",
    "--apple-glass-shadow": "0 4px 24px oklch(0 0 0 / 0.06), 0 1px 2px oklch(0 0 0 / 0.04)",
    "--apple-glass-shadow-lg": "0 12px 40px oklch(0 0 0 / 0.08), 0 2px 8px oklch(0 0 0 / 0.04)",
    "--apple-glow-1": "oklch(0.70 0.12 55 / 50%)",
    "--apple-glow-2": "oklch(0.65 0.10 70 / 45%)",
    "--apple-glow-3": "oklch(0.60 0.08 45 / 35%)",
  },
  cool: {
    "--background": "oklch(0.20 0.06 235)",
    "--apple-bg": "oklch(0.20 0.06 235)",
    "--sidebar": "oklch(0.16 0.05 235)",
    "--card": "oklch(0.24 0.05 230)",
    "--popover": "oklch(0.24 0.05 230)",
    "--secondary": "oklch(0.24 0.04 235)",
    "--muted": "oklch(0.24 0.04 235)",
    "--accent": "oklch(0.24 0.04 235)",
    "--foreground": "oklch(0.95 0 0)",
    "--card-foreground": "oklch(0.95 0 0)",
    "--popover-foreground": "oklch(0.95 0 0)",
    "--secondary-foreground": "oklch(0.95 0 0)",
    "--muted-foreground": "oklch(0.75 0 0)",
    "--accent-foreground": "oklch(0.95 0 0)",
    "--apple-text-primary": "oklch(0.95 0 0)",
    "--apple-text-secondary": "oklch(0.75 0 0)",
    "--apple-text-tertiary": "oklch(0.60 0 0)",
    "--apple-glass-bg": "oklch(0.25 0.04 235 / 0.6)",
    "--apple-glass-bg-hover": "oklch(0.30 0.04 235 / 0.7)",
    "--apple-glass-border": "oklch(0.35 0.03 235 / 0.45)",
    "--apple-glass-highlight": "oklch(0.35 0 0 / 0.12)",
    "--border": "oklch(1 0 0 / 8%)",
    "--input": "oklch(1 0 0 / 10%)",
    "--ring": "oklch(0.55 0.10 235)",
    "--sidebar-foreground": "oklch(0.95 0 0)",
    "--sidebar-accent": "oklch(0.28 0.05 240)",
    "--sidebar-accent-foreground": "oklch(0.95 0 0)",
    "--sidebar-border": "oklch(1 0 0 / 6%)",
    "--sidebar-ring": "oklch(0.55 0.15 235)",
    "--sidebar-primary-foreground": "oklch(0.95 0 0)",
    "--primary-foreground": "oklch(0.95 0 0)",
    "--apple-bg-foreground": "oklch(0.95 0 0)",
    "--apple-glass-shadow": "0 4px 24px oklch(0 0 0 / 0.4), 0 1px 2px oklch(0 0 0 / 0.3)",
    "--apple-glass-shadow-lg": "0 12px 40px oklch(0 0 0 / 0.5), 0 2px 8px oklch(0 0 0 / 0.35)",
    "--apple-glow-1": "oklch(0.55 0.20 235 / 50%)",
    "--apple-glow-2": "oklch(0.50 0.18 240 / 45%)",
    "--apple-glow-3": "oklch(0.45 0.15 230 / 35%)",
  },
  // blueviolet = CSS defaults, no inline styles needed
  blueviolet: {},
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [currentTheme, setCurrentTheme] = useState<ThemeKey>(() => {
    return (localStorage.getItem(THEME_KEY) as ThemeKey) || "blueviolet"
  })

  const setTheme = useCallback((theme: ThemeKey) => {
    localStorage.setItem(THEME_KEY, theme)
    setCurrentTheme(theme)
  }, [])

  useEffect(() => {
    const styles = themeStyles[currentTheme]

    if (Object.keys(styles).length > 0) {
      // Apply warm/cool styles
      for (const [prop, value] of Object.entries(styles)) {
        document.documentElement.style.setProperty(prop, value)
      }
    } else {
      // blueviolet: remove all inline overrides to use CSS defaults
      ALL_VARS.forEach(v => document.documentElement.style.removeProperty(v))
      // Also clear glow vars
      document.documentElement.style.removeProperty("--apple-glow-1")
      document.documentElement.style.removeProperty("--apple-glow-2")
      document.documentElement.style.removeProperty("--apple-glow-3")
    }
  }, [currentTheme])

  return (
    <ThemeContext.Provider value={{ currentTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const THEMES = [
  { key: "warm" as const, label: "暖色渐变" },
  { key: "cool" as const, label: "冷色渐变" },
  { key: "blueviolet" as const, label: "蓝紫渐变" },
] as const
