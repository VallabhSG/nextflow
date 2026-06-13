"use client";

import { useState } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import {
  Boxes,
  BookOpen,
  FolderClosed,
  History as HistoryIcon,
  Library,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Sparkles,
  Workflow as WorkflowIcon,
} from "lucide-react";

interface CanvasSidebarProps {
  onOpenPicker: () => void;
  historyOpen: boolean;
  onToggleHistory: () => void;
}

interface NavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  active?: boolean;
  /** Present for visual parity with the reference; not a functional page. */
  disabled?: boolean;
  external?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Workflows", icon: WorkflowIcon, href: "/app/workflows" },
  { label: "Flow", icon: Sparkles, active: true },
  { label: "Projects", icon: FolderClosed, disabled: true },
  { label: "Library", icon: Library, disabled: true },
  { label: "Nodes", icon: Boxes, disabled: true },
  {
    label: "API / MCP",
    icon: BookOpen,
    href: "https://github.com/VallabhSG/nextflow",
    external: true,
  },
];

/** Collapsible left sidebar mirroring the Magica app shell. */
export function CanvasSidebar({
  onOpenPicker,
  historyOpen,
  onToggleHistory,
}: CanvasSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const width = collapsed ? "w-14" : "w-60";

  return (
    <nav
      className={`flex ${width} shrink-0 flex-col border-r border-zinc-200 bg-white py-3 transition-[width] duration-200`}
    >
      {/* Brand + collapse */}
      <div
        className={`flex items-center px-3 ${collapsed ? "justify-center" : "justify-between"}`}
      >
        <Link href="/app/workflows" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white">
            <WorkflowIcon className="h-4.5 w-4.5" />
          </span>
          {!collapsed && (
            <span className="text-[15px] font-bold tracking-tight text-zinc-900">
              NextFlow
            </span>
          )}
        </Link>
        {!collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="mx-auto mt-2 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          title="Expand sidebar"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}

      {/* New workflow + Search */}
      <div className="mt-4 flex flex-col gap-1 px-2">
        <Link
          href="/app/workflows"
          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 ${
            collapsed ? "justify-center" : ""
          }`}
          title="New workflow"
        >
          <Plus className="h-4.5 w-4.5 shrink-0" />
          {!collapsed && "New workflow"}
        </Link>
        <button
          type="button"
          onClick={onOpenPicker}
          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 ${
            collapsed ? "justify-center" : ""
          }`}
          title="Add node"
        >
          <Search className="h-4.5 w-4.5 shrink-0" />
          {!collapsed && "Add node"}
        </button>
      </div>

      {/* Nav */}
      <div className="mt-3 flex flex-col gap-0.5 px-2">
        {NAV_ITEMS.map((item) => {
          const base = `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ${
            collapsed ? "justify-center" : ""
          }`;
          const tone = item.active
            ? "bg-[#6c5ce7]/10 font-medium text-[#6c5ce7]"
            : item.disabled
              ? "cursor-not-allowed text-zinc-300"
              : "text-zinc-600 hover:bg-zinc-100";
          const content = (
            <>
              <item.icon className="h-4.5 w-4.5 shrink-0" />
              {!collapsed && item.label}
            </>
          );
          if (item.disabled) {
            return (
              <span
                key={item.label}
                className={`${base} ${tone}`}
                title={`${item.label} — not part of this build`}
              >
                {content}
              </span>
            );
          }
          return (
            <Link
              key={item.label}
              href={item.href ?? "#"}
              target={item.external ? "_blank" : undefined}
              className={`${base} ${tone}`}
              title={item.label}
            >
              {content}
            </Link>
          );
        })}
      </div>

      {/* Bottom: history toggle, settings, user */}
      <div className="mt-auto flex flex-col gap-1 px-2">
        <button
          type="button"
          onClick={onToggleHistory}
          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ${
            collapsed ? "justify-center" : ""
          } ${
            historyOpen
              ? "bg-[#6c5ce7]/10 font-medium text-[#6c5ce7]"
              : "text-zinc-600 hover:bg-zinc-100"
          }`}
          title="Run history"
        >
          <HistoryIcon className="h-4.5 w-4.5 shrink-0" />
          {!collapsed && "History"}
        </button>
        <div
          className={`flex items-center gap-2.5 px-2.5 py-2 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <span className="text-zinc-500">
            <Settings className="h-4.5 w-4.5 shrink-0" />
          </span>
          {!collapsed && (
            <span className="text-sm text-zinc-500">Settings</span>
          )}
        </div>
        <div
          className={`flex items-center gap-2.5 px-2.5 py-1.5 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <UserButton />
          {!collapsed && (
            <span className="text-xs text-zinc-500">Your account</span>
          )}
        </div>
      </div>
    </nav>
  );
}
