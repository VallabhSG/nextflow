import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { workflowGraphSchema } from "@/lib/workflow/types";
import { WorkflowCanvas } from "@/components/canvas/WorkflowCanvas";

export const dynamic = "force-dynamic";

export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;
  const workflow = await prisma.workflow.findFirst({
    where: { id, userId },
  });
  if (!workflow) notFound();

  const graph = workflowGraphSchema.safeParse(workflow.graph);
  if (!graph.success) {
    throw new Error("Stored workflow graph is invalid");
  }

  return (
    <WorkflowCanvas
      workflowId={workflow.id}
      workflowName={workflow.name}
      graph={graph.data}
    />
  );
}
