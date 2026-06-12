import { prisma } from "@/lib/prisma";
import { fail, handle, ok, requireUserId } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

/** Poll endpoint: current status of a run including all node runs. */
export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { id } = await params;
    const run = await prisma.workflowRun.findFirst({
      where: { id, userId },
      include: { nodeRuns: true },
    });
    if (!run) return fail("Run not found", 404);
    return ok(run);
  });
}
