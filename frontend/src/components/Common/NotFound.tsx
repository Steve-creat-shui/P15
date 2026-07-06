import { Link } from "@tanstack/react-router"
import { AppleButton } from "@/components/ui/AppleButton"

const NotFound = () => {
  return (
    <div
      className="flex min-h-screen items-center justify-center flex-col p-4"
      data-testid="not-found"
    >
      <div className="relative flex items-center">
        <div className="absolute inset-0 rounded-full bg-apple-accent/5 blur-3xl" />
        <div className="relative flex flex-col ml-4 items-center justify-center p-4">
          <span className="text-6xl md:text-8xl font-bold leading-none mb-4 text-apple-text-primary">
            404
          </span>
          <span className="text-2xl font-semibold text-apple-text-secondary">Oops!</span>
        </div>
      </div>

      <p className="text-apple-text-secondary mb-4 text-center z-10 max-w-md">
        The page you are looking for was not found.
      </p>
      <div className="z-10">
        <Link to="/">
          <AppleButton className="mt-4">Go Back</AppleButton>
        </Link>
      </div>
    </div>
  )
}

export default NotFound
