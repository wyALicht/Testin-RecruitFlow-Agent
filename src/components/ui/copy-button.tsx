"use client";

import { useState } from "react";

export function CopyButton({
  value,
  label = "复制",
  copiedLabel = "已复制"
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button className="btn-ghost" type="button" onClick={handleCopy}>
      {copied ? copiedLabel : label}
    </button>
  );
}
