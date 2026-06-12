import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiEnvelope<T>>(
    { success: true, data, error: null },
    init
  );
}

export function fail(error: string, status: number) {
  return NextResponse.json<ApiEnvelope<null>>(
    { success: false, data: null, error },
    { status }
  );
}

/** Returns the authenticated Clerk user id or throws a 401 response. */
export async function requireUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) {
    throw fail("Unauthorized", 401);
  }
  return userId;
}

/** Wraps a route handler: converts thrown NextResponses and errors. */
export async function handle<T>(
  fn: () => Promise<T>
): Promise<NextResponse | T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("[NextFlow] API error:", error);
    return fail(
      error instanceof Error ? error.message : "Internal server error",
      500
    );
  }
}
