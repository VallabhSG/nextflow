import { prisma } from "@/lib/prisma";
import { fail, handle, ok, requireUserId } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { id } = await params;
    const workflow = await prisma.workflow.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!workflow) return fail("Workflow not found", 404);

    const runs = await prisma.workflowRun.findMany({
      where: { workflowId: id },
      orderBy: { startedAt: "desc" },
      take: 50,
      include: {
        nodeRuns: {
          select: {
            id: true,
            nodeId: true,
            nodeType: true,
            nodeLabel: true,
            status: true,
            inputs: true,
            outputs: true,
            error: true,
            startedAt: true,
            finishedAt: true,
            durationMs: true,
          },
        },
      },
    });
    return ok(runs);
  });
}
