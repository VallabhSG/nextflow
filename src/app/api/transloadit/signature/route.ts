import { createHmac } from "node:crypto";
import { handle, ok, fail, requireUserId } from "@/lib/api";

/**
 * Returns signed Transloadit assembly params for client-side uploads
 * (Uppy's Transloadit plugin). Requires TRANSLOADIT_AUTH_KEY and
 * TRANSLOADIT_AUTH_SECRET; TRANSLOADIT_TEMPLATE_ID is optional.
 */
export async function POST() {
  return handle(async () => {
    await requireUserId();

    const authKey = process.env.TRANSLOADIT_AUTH_KEY;
    const authSecret = process.env.TRANSLOADIT_AUTH_SECRET;
    if (!authKey || !authSecret) {
      return fail("Transloadit is not configured", 501);
    }

    const expires = new Date(Date.now() + 30 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .replace(/\.\d+Z$/, "+00:00");

    const params: Record<string, unknown> = {
      auth: { key: authKey, expires },
      ...(process.env.TRANSLOADIT_TEMPLATE_ID
        ? { template_id: process.env.TRANSLOADIT_TEMPLATE_ID }
        : {
            steps: {
              ":original": {
                robot: "/upload/handle",
              },
            },
          }),
    };

    const paramsJson = JSON.stringify(params);
    const signature =
      "sha384:" +
      createHmac("sha384", authSecret).update(paramsJson).digest("hex");

    return ok({ params: paramsJson, signature });
  });
}
