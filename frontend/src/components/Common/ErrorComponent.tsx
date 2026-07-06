import { Link } from "@tanstack/react-router"
import { AppleButton } from "@/components/ui/AppleButton"

const ErrorComponent = () => {
  return (
    <div
      className="flex min-h-screen items-center justify-center flex-col p-4"
      data-testid="error-component"
    >
      <div className="relative flex items-center">
        <div className="absolute inset-0 rounded-full bg-destructive/5 blur-3xl" />
        <div className="relative flex flex-col ml-4 items-center justify-center p-4">
          <span className="text-6xl md:text-8xl font-bold leading-none mb-4 text-apple-text-primary">
            Error
          </span>
          <span className="text-2xl font-semibold text-apple-text-secondary">Oops!</span>
        </div>
      </div>

      <p className="text-apple-text-secondary mb-4 text-center z-10 max-w-md">
        Something went wrong. Please try again.
      </p>
      <Link to="/">
        <AppleButton className="mt-4">Go Home</AppleButton>
      </Link>
    </div>
  )
}

export default ErrorComponent
