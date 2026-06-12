"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    __nextflowCandidateLogged?: boolean;
  }
}

const LINKEDIN_URL =
  process.env.NEXT_PUBLIC_LINKEDIN_URL ??
  "https://www.linkedin.com/in/your-profile";

/**
 * Spec requirement: on initial page render, emit exactly one console.log
 * formatted as `[NextFlow] Candidate LinkedIn: <full-linkedin-profile-url>`.
 */
export function CandidateConsoleLog() {
  useEffect(() => {
    if (window.__nextflowCandidateLogged) return;
    window.__nextflowCandidateLogged = true;
    console.log(`[NextFlow] Candidate LinkedIn: ${LINKEDIN_URL}`);
  }, []);

  return null;
}
