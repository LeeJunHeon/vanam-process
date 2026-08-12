"use client";

import { Menu } from "lucide-react";

export default function Header({
  title,
  onToggleSidebar,
}: {
  title: string;
  onToggleSidebar: () => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-100 bg-white px-4 sm:px-5">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="rounded-lg p-2 transition-colors hover:bg-gray-100"
        >
          <Menu size={18} className="text-gray-500" />
        </button>
        <span className="text-sm font-semibold text-gray-700">{title}</span>
      </div>
    </header>
  );
}
