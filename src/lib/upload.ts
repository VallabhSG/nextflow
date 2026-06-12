"use client";

interface TransloaditResult {
  ok?: string;
  error?: string;
  assembly_ssl_url?: string;
  results?: Record<string, Array<{ ssl_url?: string }>>;
}

async function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const POLL_INTERVAL_MS = 1500;
const MAX_POLLS = 60;

/**
 * Uploads an image via Transloadit and returns its hosted URL.
 * Falls back to an inline data URL when Transloadit is not configured.
 */
export async function uploadImage(file: File): Promise<string> {
  const sigRes = await fetch("/api/transloadit/signature", { method: "POST" });

  if (sigRes.status === 501) {
    // Transloadit not configured — inline the image instead.
    return readAsDataUrl(file);
  }
  if (!sigRes.ok) throw new Error("Failed to get upload signature");

  const sig = (await sigRes.json()) as {
    data: { params: string; signature: string };
  };

  const form = new FormData();
  form.append("params", sig.data.params);
  form.append("signature", sig.data.signature);
  form.append("file", file);

  const assemblyRes = await fetch("https://api2.transloadit.com/assemblies", {
    method: "POST",
    body: form,
  });
  if (!assemblyRes.ok) throw new Error("Transloadit upload failed");
  let assembly = (await assemblyRes.json()) as TransloaditResult;
  if (assembly.error) throw new Error(`Transloadit: ${assembly.error}`);

  // Poll until the assembly finishes.
  let polls = 0;
  while (assembly.ok !== "ASSEMBLY_COMPLETED" && polls < MAX_POLLS) {
    if (assembly.error) throw new Error(`Transloadit: ${assembly.error}`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    if (!assembly.assembly_ssl_url) break;
    const poll = await fetch(assembly.assembly_ssl_url);
    assembly = (await poll.json()) as TransloaditResult;
    polls++;
  }

  const url = assembly.results?.[":original"]?.[0]?.ssl_url;
  if (!url) throw new Error("Transloadit returned no file URL");
  return url;
}
