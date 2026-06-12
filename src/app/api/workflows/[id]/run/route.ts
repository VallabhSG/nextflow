import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, handle, ok, requireUserId } from "@/lib/api";
import { startRun } from "@/lib/execution/run";
import { workflowGraphSchema } from "@/lib/workflow/types";
import { isAcyclic } from "@/lib/workflow/validation";

type Params = { params: Promise<{ id: string }> };

const runSchema = z.object({
  /** Node ids to execute; omit or empty for the full workflow. */
  nodeIds: z.array(z.string()).optional(),
  /** Latest client-side graph; persisted before the run starts. */
  graph: workflowGraphSchema.optional(),
});

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { id } = await params;
    const workflow = await prisma.workflow.findFirst({
      where: { id, userId },
    });
    if (!workflow) return fail("Workflow not found", 404);

    const body = runSchema.safeParse(await req.json().catch(() => ({})));
    if (!body.success) {
      return fail("Invalid request: " + body.error.message, 400);
    }

    // Persist the freshest graph before running so the run matches the canvas.
    let graph = body.data.graph;
    if (graph) {
      if (!isAcyclic(graph.nodes, graph.edges)) {
        return fail("Workflow contains a cycle — only DAGs are allowed", 400);
      }
      await prisma.workflow.update({ where: { id }, data: { graph } });
    } else {
      const parsed = workflowGraphSchema.safeParse(workflow.graph);
      if (!parsed.success) return fail("Stored workflow graph is invalid", 500);
      graph = parsed.data;
    }

    const runId = await startRun({
      workflowId: id,
      userId,
      graph,
      selectedIds: body.data.nodeIds,
    });

    return ok({ runId }, { status: 202 });
  });
}
