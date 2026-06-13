"use client";

import { useMemo, useState } from "react";
import {
  Boxes,
  Clock,
  Crop,
  Image as ImageIcon,
  Music,
  Plus,
  Search,
  Sparkles,
  StickyNote,
  Video,
  X,
} from "lucide-react";
import type { NodeKind } from "@/lib/workflow/types";

type Category = "Image" | "Video" | "Audio" | "Others";
type IconType = React.ComponentType<{ className?: string }>;

interface PickerEntry {
  kind: NodeKind;
  title: string;
  description: string;
  category: Category;
  Icon: IconType;
  iconClass: string;
}

const ENTRIES: PickerEntry[] = [
  {
    kind: "crop-image",
    title: "Crop Image",
    description: "Crop an image region with FFmpeg",
    category: "Image",
    Icon: Crop,
    iconClass: "text-blue-500",
  },
  {
    kind: "gemini",
    title: "Gemini 3.1 Pro",
    description: "Multimodal LLM — text, vision, video, audio, files",
    category: "Others",
    Icon: Sparkles,
    iconClass: "text-[#6c5ce7]",
  },
];

/** Category section headers (icon + label), in display order. */
const CATEGORY_META: { name: Category; Icon: IconType }[] = [
  { name: "Image", Icon: ImageIcon },
  { name: "Video", Icon: Video },
  { name: "Audio", Icon: Music },
  { name: "Others", Icon: Boxes },
];

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
  onAddNote: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Bottom-center toolbar: [Add note] [Add node] with a searchable picker. */
export function NodePicker({
  onAdd,
  onAddNote,
  open,
  onOpenChange,
}: NodePickerProps) {
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<NodeKind[]>([]);

  function setOpen(next: boolean) {
    if (next) {
      setRecents(readRecents());
      setQuery("");
    }
    onOpenChange(next);
  }

  /** Grouped sections (Recent + each category), filtered by the search query. */
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (e: PickerEntry) =>
      !q ||
      e.title.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q);

    const result: { name: string; Icon: IconType; items: PickerEntry[] }[] = [];

    if (!q) {
      const recentItems = recents
        .map((kind) => ENTRIES.find((e) => e.kind === kind))
        .filter((e): e is PickerEntry => Boolean(e));
      if (recentItems.length > 0) {
        result.push({ name: "Recent", Icon: Clock, items: recentItems });
      }
    }

    for (const meta of CATEGORY_META) {
      const items = ENTRIES.filter(
        (e) => e.category === meta.name && matches(e)
      );
      if (items.length > 0) {
        result.push({ name: meta.name, Icon: meta.Icon, items });
      }
    }
    return result;
  }, [query, recents]);

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
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search nodes or models…"
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

            <div className="panel-scroll max-h-72 overflow-y-auto p-1.5">
              {sections.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-zinc-400">
                  No nodes match “{query}”.
                </p>
              ) : (
                sections.map((section) => (
                  <div key={section.name} className="mb-1">
                    <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold text-zinc-500">
                      <section.Icon className="h-3.5 w-3.5" />
                      {section.name}
                    </div>
                    {section.items.map((entry) => (
                      <button
                        key={`${section.name}-${entry.kind}`}
                        type="button"
                        onClick={() => pick(entry.kind)}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-zinc-50"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white">
                          <entry.Icon className={`h-4 w-4 ${entry.iconClass}`} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-zinc-800">
                            {entry.title}
                          </span>
                          <span className="block truncate text-[11px] text-zinc-500">
                            {entry.description}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 rounded-full border border-zinc-200 bg-white p-1 shadow-lg">
          <button
            type="button"
            onClick={onAddNote}
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-600 transition hover:bg-amber-100 hover:text-amber-600"
            aria-label="Add note"
            title="Add note"
          >
            <StickyNote className="h-4 w-4" />
          </button>
          <div className="h-5 w-px bg-zinc-200" />
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-zinc-700 transition hover:bg-[#6c5ce7]/10 hover:text-[#6c5ce7]"
            aria-label="Add node"
            title="Add node"
          >
            <Plus
              className={`h-4.5 w-4.5 transition-transform ${open ? "rotate-45" : ""}`}
            />
            <span className="text-xs font-medium">Add node</span>
          </button>
        </div>
      </div>
    </div>
  );
}
