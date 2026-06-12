import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, handle, ok, requireUserId } from "@/lib/api";
import { workflowGraphSchema } from "@/lib/workflow/types";
import { isAcyclic } from "@/lib/workflow/validation";

type Params = { params: Promise<{ id: string }> };

async function findOwned(id: string, userId: string) {
  return prisma.workflow.findFirst({ where: { id, userId } });
}

export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { id } = await params;
    const workflow = await findOwned(id, userId);
    if (!workflow) return fail("Workflow not found", 404);
    return ok(workflow);
  });
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  graph: workflowGraphSchema.optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { id } = await params;
    const workflow = await findOwned(id, userId);
    if (!workflow) return fail("Workflow not found", 404);

    const body = patchSchema.safeParse(await req.json());
    if (!body.success) {
      return fail("Invalid request: " + body.error.message, 400);
    }
    const { name, graph } = body.data;

    if (graph && !isAcyclic(graph.nodes, graph.edges)) {
      return fail("Workflow contains a cycle — only DAGs are allowed", 400);
    }

    const updated = await prisma.workflow.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(graph !== undefined ? { graph } : {}),
      },
    });
    return ok(updated);
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { id } = await params;
    const workflow = await findOwned(id, userId);
    if (!workflow) return fail("Workflow not found", 404);
    await prisma.workflow.delete({ where: { id } });
    return ok({ deleted: true });
  });
}
