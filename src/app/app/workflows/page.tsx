import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Workflow } from "lucide-react";
import { WorkflowList } from "@/components/dashboard/WorkflowList";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white">
            <Workflow className="h-4.5 w-4.5" />
          </span>
          <h1 className="text-lg font-bold text-zinc-900">NextFlow</h1>
          <div className="ml-auto">
            <UserButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <h2 className="mb-1 text-xl font-semibold text-zinc-900">
          Your workflows
        </h2>
        <p className="mb-6 text-sm text-zinc-500">
          Create, open, rename, and delete LLM workflows.
        </p>
        <WorkflowList />
      </main>
    </div>
  );
}
