import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Search } from "lucide-react"
import { Suspense } from "react"

import { GlassCard } from "@/components/ui/GlassCard"
import { ItemsService } from "@/client"
import { DataTable } from "@/components/Common/DataTable"
import AddItem from "@/components/Items/AddItem"
import { columns } from "@/components/Items/columns"
import PendingItems from "@/components/Pending/PendingItems"

function getItemsQueryOptions() {
  return {
    queryFn: () => ItemsService.readItems({ skip: 0, limit: 100 }),
    queryKey: ["items"],
  }
}

export const Route = createFileRoute("/_layout/items")({
  component: Items,
  head: () => ({
    meta: [
      {
        title: "Items - JEVS",
      },
    ],
  }),
})

function ItemsTableContent() {
  const { data: items } = useSuspenseQuery(getItemsQueryOptions())

  if (items.data.length === 0) {
    return (
      <GlassCard className="flex flex-col items-center justify-center py-12 gap-4">
        <Search className="h-8 w-8 text-apple-text-tertiary/40" />
        <h3 className="text-lg font-semibold text-apple-text-primary">You don't have any items yet</h3>
        <p className="text-apple-text-secondary text-sm">Add a new item to get started</p>
      </GlassCard>
    )
  }

  return <DataTable columns={columns} data={items.data} />
}

function ItemsTable() {
  return (
    <Suspense fallback={<PendingItems />}>
      <ItemsTableContent />
    </Suspense>
  )
}

function Items() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-apple-text-primary">Items</h1>
          <p className="text-apple-text-secondary mt-1">Create and manage your items</p>
        </div>
        <AddItem />
      </div>
      <ItemsTable />
    </div>
  )
}
