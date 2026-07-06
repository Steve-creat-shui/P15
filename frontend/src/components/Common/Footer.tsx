import { FaGithub, FaLinkedinIn } from "react-icons/fa"
import { FaXTwitter } from "react-icons/fa6"

const socialLinks = [
  {
    icon: FaGithub,
    href: "https://github.com/fastapi/fastapi",
    label: "GitHub",
  },
  { icon: FaXTwitter, href: "https://x.com/fastapi", label: "X" },
  {
    icon: FaLinkedinIn,
    href: "https://linkedin.com/company/fastapi",
    label: "LinkedIn",
  },
]

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t border-apple-glass-border/20 py-4 px-6 bg-apple-glass-bg/50 backdrop-blur-sm">
      <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="text-apple-text-tertiary text-sm">
          JEVS - {currentYear}
        </p>
        <div className="flex items-center gap-4">
          {socialLinks.map(({ icon: Icon, href, label }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="text-apple-text-tertiary hover:text-apple-text-secondary transition-colors duration-200"
            >
              <Icon className="h-5 w-5" />
            </a>
          ))}
        </div>
      </div>
    </footer>
  )
}
