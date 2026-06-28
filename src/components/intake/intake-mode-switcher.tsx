"use client";

import { useState } from "react";

import { BatchResumeIntake } from "@/components/intake/batch-resume-intake";
import type { IntakeDepartment, IntakePosition } from "@/components/intake/intake-types";
import { IntakeWorkbench } from "@/components/intake/intake-workbench";

export function IntakeModeSwitcher({
  departments,
  positions,
  initialPositionId = ""
}: {
  departments: IntakeDepartment[];
  positions: IntakePosition[];
  initialPositionId?: string;
}) {
  const [mode, setMode] = useState<"single" | "batch">(
    initialPositionId ? "single" : "batch"
  );

  return (
    <div className="grid">
      <div className="intake-mode-heading">
        <div>
          <strong>选择录入方式</strong>
          <span>批量简历上传已启用，可一次选择多份文件并逐份确认入库。</span>
        </div>
        <span className="pill slate">支持最多 20 份</span>
      </div>
      <div className="intake-mode-switch" role="tablist" aria-label="AI 录入方式">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "single"}
          className={mode === "single" ? "active" : ""}
          onClick={() => setMode("single")}
        >
          单份录入
          <span>支持文本和单份简历，逐字段复核</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "batch"}
          className={mode === "batch" ? "active" : ""}
          onClick={() => setMode("batch")}
        >
          批量上传简历
          <span>一次选择多份文件、逐份解析并批量入库</span>
        </button>
      </div>

      {mode === "single" ? (
        <IntakeWorkbench
          departments={departments}
          positions={positions}
          initialPositionId={initialPositionId}
        />
      ) : (
        <BatchResumeIntake
          departments={departments}
          positions={positions}
          initialPositionId={initialPositionId}
        />
      )}
    </div>
  );
}
