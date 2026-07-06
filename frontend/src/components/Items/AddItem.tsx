import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { type ItemCreate, ItemsService } from "@/client"
import { AppleButton } from "@/components/ui/AppleButton"
import { AppleDialog, AppleDialogClose, AppleDialogContent, AppleDialogFooter, AppleDialogHeader, AppleDialogTitle, AppleDialogDescription, AppleDialogTrigger } from "@/components/ui/apple/AppleDialog"
import { LoadingButton } from "@/components/ui/loading-button"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

const formSchema = z.object({
  title: z.string().min(1, { message: "Title is required" }),
  description: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

const AddItem = () => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      title: "",
      description: "",
    },
  })

  const mutation = useMutation({
    mutationFn: (data: ItemCreate) =>
      ItemsService.createItem({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("Item created successfully")
      form.reset()
      setIsOpen(false)
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
      <AppleDialogTrigger asChild>
        <AppleButton className="my-4">
          <Plus className="mr-2" />
          Add Item
        </AppleButton>
      </AppleDialogTrigger>
      <AppleDialogContent className="sm:max-w-md">
        <AppleDialogHeader>
          <AppleDialogTitle>Add Item</AppleDialogTitle>
          <AppleDialogDescription>
            Fill in the details to add a new item.
          </AppleDialogDescription>
        </AppleDialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)}>
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
                required
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

export default AddItem
