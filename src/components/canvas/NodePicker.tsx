"use client";

import { useMemo, useRef, useState } from "react";
import { Crop, Plus, Search, Sparkles, X } from "lucide-react";
import type { NodeKind } from "@/lib/workflow/types";

interface PickerEntry {
  kind: NodeKind;
  title: string;
  description: string;
  category: "Image" | "Video" | "Audio" | "Others";
  icon: React.ReactNode;
}

const ENTRIES: PickerEntry[] = [
  {
    kind: "crop-image",
    title: "Crop Image",
    description: "Crop an image region with FFmpeg",
    category: "Image",
    icon: <Crop className="h-4 w-4 text-blue-500" />,
  },
  {
    kind: "gemini",
    title: "Gemini 3.1 Pro",
    description: "Multimodal LLM — text, vision, video, audio, files",
    category: "Others",
    icon: <Sparkles className="h-4 w-4 text-[#6c5ce7]" />,
  },
];

const CATEGORIES = ["Recent", "Image", "Video", "Audio", "Others"] as const;
type Category = (typeof CATEGORIES)[number];

const RECENT_KEY = "nextflow-recent-nodes";

function readRecents(): NodeKind[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as NodeKind[]) : [];
  } catch {
    return [];
  }
}

interface NodePickerProps {
  onAdd: (kind: NodeKind) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Bottom-center "+" picker with searchable categories. */
export function NodePicker({ onAdd, open, onOpenChange }: NodePickerProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("Recent");
  const [recents, setRecents] = useState<NodeKind[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function setOpen(next: boolean) {
    if (next) {
      setRecents(readRecents());
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    onOpenChange(next);
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      return ENTRIES.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q)
      );
    }
    if (category === "Recent") {
      const list = recents
        .map((kind) => ENTRIES.find((e) => e.kind === kind))
        .filter((e): e is PickerEntry => Boolean(e));
      return list.length > 0 ? list : ENTRIES;
    }
    return ENTRIES.filter((e) => e.category === category);
  }, [query, category, recents]);

  function pick(kind: NodeKind) {
    const next = [kind, ...readRecents().filter((k) => k !== kind)].slice(0, 8);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // localStorage unavailable — recents simply won't persist
    }
    onAdd(kind);
    setOpen(false);
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center">
      <div className="pointer-events-auto flex flex-col items-center">
        {open && (
          <div className="mb-3 w-[420px] rounded-xl border border-zinc-200 bg-white shadow-2xl">
            <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2">
              <Search className="h-4 w-4 text-zinc-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search nodes…"
                className="flex-1 bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-zinc-400 hover:text-zinc-600"
                aria-label="Close node picker"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!query && (
              <div className="flex gap-1 border-b border-zinc-100 px-2 py-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`rounded-md px-2.5 py-1 text-xs ${
                      category === c
                        ? "bg-[#6c5ce7]/10 font-medium text-[#6c5ce7]"
                        : "text-zinc-500 hover:bg-zinc-100"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}

            <div className="panel-scroll max-h-64 overflow-y-auto p-2">
              {visible.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-zinc-400">
                  No nodes match{query ? ` “${query}”` : " this category"}.
                </p>
              ) : (
                visible.map((entry) => (
                  <button
                    key={entry.kind}
                    type="button"
                    onClick={() => pick(entry.kind)}
                    className="flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-zinc-50"
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white">
                      {entry.icon}
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-zinc-800">
                        {entry.title}
                      </span>
                      <span className="block text-xs text-zinc-500">
                        {entry.description}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex h-10 items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 text-zinc-700 shadow-lg transition hover:border-[#6c5ce7] hover:text-[#6c5ce7]"
          aria-label="Add node"
        >
          <Plus
            className={`h-4.5 w-4.5 transition-transform ${open ? "rotate-45" : ""}`}
          />
          <span className="text-xs font-medium">Add node</span>
        </button>
      </div>
    </div>
  );
}
