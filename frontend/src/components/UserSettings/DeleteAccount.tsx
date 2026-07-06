import DeleteConfirmation from "./DeleteConfirmation"

const DeleteAccount = () => {
  return (
    <div className="max-w-md mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
      <h3 className="font-semibold text-destructive">Delete Account</h3>
      <p className="mt-1 text-sm text-apple-text-secondary">
        Permanently delete your account and all associated data.
      </p>
      <DeleteConfirmation />
    </div>
  )
}

export default DeleteAccount
