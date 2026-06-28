"use client";

import { CandidateStatus, RawInputType } from "@prisma/client";
import Link from "next/link";
import { useState, useTransition } from "react";

import { AI_PROVIDER_OPTIONS, type AIProviderOptionValue } from "@/lib/ai/options";
import { authFetch } from "@/lib/auth/client-session";
import { INPUT_SCENE_LABELS, INPUT_TYPE_LABELS, STATUS_LABELS } from "@/lib/constants";

type ReparseResult = {
  rawInputId: string;
  providerName: string;
  draft: {
    name: string;
    status: CandidateStatus;
    confidence: number;
    uncertainFields: string[];
    positionTitle: string | null;
    inputType: RawInputType;
    inputScene: keyof typeof INPUT_SCENE_LABELS;
    tags: string[];
    followUpSuggestion: string | null;
  };
  duplicate: {
    candidateId: string;
    candidateName: string;
    score: number;
  } | null;
};

export function AIReparseControls({
  content,
  inputTypeHint
}: {
  content: string;
  inputTypeHint: RawInputType;
}) {
  const [provider, setProvider] = useState<AIProviderOptionValue>("qwen");
  const [result, setResult] = useState<ReparseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function rerun() {
    setError(null);

    startTransition(async () => {
      try {
        const response = await authFetch("/api/agent/extract", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            content,
            provider,
            inputTypeHint
          })
        });

        const payload = (await response.json()) as ReparseResult & { error?: string };
        if (!response.ok) {
          setResult(null);
          setError(payload.error || "重新解析失败");
          return;
        }

        setResult(payload);
      } catch (requestError) {
        setResult(null);
        setError(requestError instanceof Error ? requestError.message : "重新解析失败");
      }
    });
  }

  return (
    <div className="subtle-item">
      <div className="inline-actions" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div className="field" style={{ minWidth: 220, flex: 1 }}>
          <label>重新解析模型</label>
          <div className="choice-group provider-choice-group">
            {AI_PROVIDER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`choice-pill provider-choice-pill ${provider === option.value ? "active" : ""}`}
                onClick={() => setProvider(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="page-note provider-note" style={{ marginBottom: 0 }}>
            当前选择：<strong>{AI_PROVIDER_OPTIONS.find((option) => option.value === provider)?.label}</strong>
            <span className="muted" style={{ marginLeft: 8 }}>
              {AI_PROVIDER_OPTIONS.find((option) => option.value === provider)?.hint}
            </span>
          </div>
        </div>

        <button className="btn" onClick={rerun} disabled={isPending || content.trim().length < 10}>
          {isPending ? "重新解析中..." : "重新解析 / 重跑 AI"}
        </button>
      </div>

      {error ? (
        <div className="alert danger" style={{ marginTop: 12 }}>
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="alert info" style={{ marginTop: 12 }}>
          <div>
            已使用 <strong>{result.providerName}</strong> 完成重跑：识别为 {result.draft.name}，状态
            {STATUS_LABELS[result.draft.status]}，置信度 {(result.draft.confidence * 100).toFixed(0)}%。
          </div>
          <div style={{ marginTop: 6 }}>
            输入类型：{INPUT_TYPE_LABELS[result.draft.inputType]} | 场景：{INPUT_SCENE_LABELS[result.draft.inputScene]}
            {result.draft.positionTitle ? ` | 岗位：${result.draft.positionTitle}` : ""}
            {result.duplicate ? ` | 疑似重复：${result.duplicate.candidateName}` : ""}
          </div>
          {result.draft.tags.length ? (
            <div style={{ marginTop: 6 }}>标签：{result.draft.tags.join("、")}</div>
          ) : null}
          {result.draft.followUpSuggestion ? (
            <div style={{ marginTop: 6 }}>跟进建议：{result.draft.followUpSuggestion}</div>
          ) : null}
          {result.draft.uncertainFields.length ? (
            <div style={{ marginTop: 6 }}>待确认字段：{result.draft.uncertainFields.join("、")}</div>
          ) : null}
          <div className="inline-actions" style={{ marginTop: 10 }}>
            <Link href="/agent-tasks" className="btn-secondary">
              去 Agent 日志查看重跑记录
            </Link>
            <Link href="/intake" className="btn-secondary">
              去 Intake 页面继续复核
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
