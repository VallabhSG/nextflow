import { clerkSetup } from "@clerk/testing/playwright";

/**
 * Runs once before the suite. clerkSetup() obtains a Clerk Testing Token using
 * CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY and makes it available to every test
 * (via setupClerkTestingToken), so Clerk's bot protection doesn't block the
 * automated sign-in.
 */
async function globalSetup() {
  await clerkSetup();
}

export default globalSetup;
