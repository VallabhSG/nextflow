import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, handle, ok, requireUserId } from "@/lib/api";
import { buildEmptyGraph, buildSampleGraph } from "@/lib/workflow/sample";
import { workflowGraphSchema } from "@/lib/workflow/types";

export async function GET() {
  return handle(async () => {
    const userId = await requireUserId();
    const workflows = await prisma.workflow.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { runs: true } },
      },
    });
    return ok(workflows);
  });
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  template: z.enum(["empty", "sample"]).default("empty"),
  graph: workflowGraphSchema.optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const userId = await requireUserId();
    const body = createSchema.safeParse(await req.json());
    if (!body.success) {
      return fail("Invalid request: " + body.error.message, 400);
    }
    const { name, template, graph } = body.data;
    const workflow = await prisma.workflow.create({
      data: {
        name,
        userId,
        graph:
          graph ?? (template === "sample" ? buildSampleGraph() : buildEmptyGraph()),
      },
    });
    return ok(workflow, { status: 201 });
  });
}
