import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Pencil } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { type ItemPublic, ItemsService } from "@/client"
import { AppleButton } from "@/components/ui/AppleButton"
import { AppleDialog, AppleDialogClose, AppleDialogContent, AppleDialogFooter, AppleDialogHeader, AppleDialogTitle, AppleDialogDescription } from "@/components/ui/apple/AppleDialog"
import { AppleDropdownMenuItem } from "@/components/ui/apple/AppleDropdownMenu"
import { LoadingButton } from "@/components/ui/loading-button"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

const formSchema = z.object({
  title: z.string().min(1, { message: "Title is required" }),
  description: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

interface EditItemProps {
  item: ItemPublic
  onSuccess: () => void
}

const EditItem = ({ item, onSuccess }: EditItemProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      title: item.title,
      description: item.description ?? undefined,
    },
  })

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      ItemsService.updateItem({ id: item.id, requestBody: data }),
    onSuccess: () => {
      showSuccessToast("Item updated successfully")
      setIsOpen(false)
      onSuccess()
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] })
    },
  })

  const onSubmit = (data: FormData) => {
    mutation.mutate(data)
  }

  return (
    <AppleDialog open={isOpen} onOpenChange={setIsOpen}>
      <AppleDropdownMenuItem
        variant="default"
        onSelect={(e) => e.preventDefault()}
        onClick={() => setIsOpen(true)}
      >
        <Pencil />
        Edit Item
      </AppleDropdownMenuItem>
      <AppleDialogContent className="sm:max-w-md">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <AppleDialogHeader>
            <AppleDialogTitle>Edit Item</AppleDialogTitle>
            <AppleDialogDescription>
              Update the item details below.
            </AppleDialogDescription>
          </AppleDialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <label className="text-sm font-medium text-apple-text-secondary">
                Title <span className="text-destructive">*</span>
              </label>
              <input
                placeholder="Title"
                type="text"
                className="flex h-11 w-full rounded-xl border border-apple-glass-border/50 bg-apple-glass-bg/70 backdrop-blur-sm px-3.5 py-2.5 text-sm text-apple-text-primary placeholder:text-apple-text-tertiary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/40 focus-visible:border-apple-accent/50 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                {...form.register("title")}
              />
              {form.formState.errors.title && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.title.message}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-apple-text-secondary">
                Description
              </label>
              <input
                placeholder="Description"
                type="text"
                className="flex h-11 w-full rounded-xl border border-apple-glass-border/50 bg-apple-glass-bg/70 backdrop-blur-sm px-3.5 py-2.5 text-sm text-apple-text-primary placeholder:text-apple-text-tertiary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-accent/40 focus-visible:border-apple-accent/50 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                {...form.register("description")}
              />
              {form.formState.errors.description && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.description.message}</p>
              )}
            </div>
          </div>

          <AppleDialogFooter>
            <AppleDialogClose asChild>
              <AppleButton variant="outline" disabled={mutation.isPending}>
                Cancel
              </AppleButton>
            </AppleDialogClose>
            <LoadingButton type="submit" loading={mutation.isPending}>
              Save
            </LoadingButton>
          </AppleDialogFooter>
        </form>
      </AppleDialogContent>
    </AppleDialog>
  )
}

export default EditItem
