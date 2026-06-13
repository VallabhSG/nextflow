"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const LINKEDIN_URL =
  process.env.NEXT_PUBLIC_LINKEDIN_URL ??
  "https://www.linkedin.com/in/your-profile";

/**
 * Spec requirement: on the initial client render of every page, emit
 * exactly one console.log formatted as
 * `[NextFlow] Candidate LinkedIn: <full-linkedin-profile-url>`.
 *
 * One log per page: fires on first mount and again whenever the route
 * changes, never twice for the same page view (ref guard covers React
 * Strict Mode double-effects).
 */
export function CandidateConsoleLog() {
  const pathname = usePathname();
  const lastLogged = useRef<string | null>(null);

  useEffect(() => {
    if (lastLogged.current === pathname) return;
    lastLogged.current = pathname;
    console.log(`[NextFlow] Candidate LinkedIn: ${LINKEDIN_URL}`);
  }, [pathname]);

  return null;
}
