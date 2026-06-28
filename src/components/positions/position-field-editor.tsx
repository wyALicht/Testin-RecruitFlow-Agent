"use client";

import { PositionFieldScope, PositionFieldType } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { authFetch } from "@/lib/auth/client-session";

type AutoFillSource =
  | "NONE"
  | "STATIC"
  | "CURRENT_USER"
  | "CURRENT_DATE"
  | "POSITION_TITLE"
  | "AI_RESUME";

type EditableField = {
  id?: string;
  key: string;
  label: string;
  fieldType: PositionFieldType;
  scope: PositionFieldScope;
  required: boolean;
  visible: boolean;
  editable: boolean;
  aiExtractable: boolean;
  system: boolean;
  options: string[];
  defaultValue: unknown;
  autoFillRule: {
    source: AutoFillSource;
    value?: unknown;
  };
  conflictPolicy: string;
  width: number;
  active: boolean;
};

const TYPE_LABELS: Record<PositionFieldType, string> = {
  TEXT: "单行文本",
  LONG_TEXT: "多行文本",
  NUMBER: "数字",
  MONEY: "金额",
  DATE: "日期",
  DATETIME: "日期时间",
  SINGLE_SELECT: "单选",
  MULTI_SELECT: "多选",
  BOOLEAN: "是 / 否",
  USER: "人员",
  FILE: "文件",
  LINK: "链接",
  RATING: "评分"
};

const AUTO_FILL_OPTIONS: Array<{ value: AutoFillSource; label: string; hint: string }> = [
  { value: "NONE", label: "不自动填充", hint: "由 HR 在招聘进度表中手动填写。" },
  { value: "STATIC", label: "固定预设值", hint: "每次创建记录时写入同一个值，例如城市“长沙”。" },
  { value: "CURRENT_USER", label: "当前登录人", hint: "自动写入当前操作人的姓名，适合 HR、负责人字段。" },
  { value: "CURRENT_DATE", label: "当前日期", hint: "创建招聘记录时自动写入当天日期。" },
  { value: "POSITION_TITLE", label: "当前岗位名称", hint: "自动写入当前招聘岗位的名称。" },
  { value: "AI_RESUME", label: "从候选人简历提取", hint: "AI 根据字段名称和类型，从上传的简历中识别内容。" }
];

const CONFLICT_OPTIONS = [
  { value: "FILL_EMPTY", label: "仅填充空值（推荐）", hint: "已有内容保持不变，最安全。" },
  { value: "OVERWRITE_NEWER", label: "使用新数据覆盖", hint: "每次自动录入都替换已有内容。" },
  { value: "APPEND", label: "追加到已有内容", hint: "保留原内容，并在后面补充新数据。" },
  { value: "REQUIRE_CONFIRMATION", label: "由 HR 确认后更新", hint: "产生冲突时等待人工选择。" },
  { value: "MANUAL_ONLY", label: "只允许手工填写", hint: "禁止自动录入修改该字段。" }
];

const SCOPE_HINTS: Record<PositionFieldScope, string> = {
  APPLICATION: "仅属于当前岗位的投递记录，例如面试安排、笔试成绩。",
  CANDIDATE: "同一候选人在不同岗位间共享，例如姓名、手机、简历。",
  SYSTEM: "由系统生成或维护，通常不允许人工编辑。"
};

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalize(
  fields: Array<
    Omit<EditableField, "options" | "autoFillRule"> & {
      options: unknown;
      autoFillRule: unknown;
    }
  >
): EditableField[] {
  return fields.map((field) => {
    const rule = jsonObject(field.autoFillRule);
    return {
      ...field,
      options: Array.isArray(field.options) ? field.options.map(String) : [],
      defaultValue: field.defaultValue ?? "",
      autoFillRule: {
        source: (typeof rule.source === "string" ? rule.source : "NONE") as AutoFillSource,
        value: rule.value ?? field.defaultValue ?? ""
      }
    };
  });
}

export function PositionFieldEditor({
  positionId,
  initialFields
}: {
  positionId: string;
  initialFields: Array<
    Omit<EditableField, "options" | "autoFillRule"> & {
      options: unknown;
      autoFillRule: unknown;
    }
  >;
}) {
  const router = useRouter();
  const [fields, setFields] = useState(normalize(initialFields));
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function patch(index: number, value: Partial<EditableField>) {
    setFields((current) =>
      current.map((field, fieldIndex) => (fieldIndex === index ? { ...field, ...value } : field))
    );
  }

  function setAutoFillSource(index: number, source: AutoFillSource) {
    const field = fields[index];
    patch(index, {
      aiExtractable: source === "AI_RESUME",
      autoFillRule: {
        source,
        value: source === "STATIC" ? field.autoFillRule.value ?? field.defaultValue ?? "" : undefined
      }
    });
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    setFields((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addField() {
    const suffix = Date.now().toString().slice(-6);
    setFields((current) => [
      ...current,
      {
        key: `custom_${suffix}`,
        label: "新字段",
        fieldType: PositionFieldType.TEXT,
        scope: PositionFieldScope.APPLICATION,
        required: false,
        visible: true,
        editable: true,
        aiExtractable: false,
        system: false,
        options: [],
        defaultValue: "",
        autoFillRule: { source: "NONE" },
        conflictPolicy: "FILL_EMPTY",
        width: 160,
        active: true
      }
    ]);
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      const response = await authFetch(`/api/positions/${positionId}/fields`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: fields.map((field, index) => ({
            ...field,
            defaultValue:
              field.autoFillRule.source === "STATIC"
                ? field.autoFillRule.value
                : field.defaultValue || undefined,
            options: Array.isArray(field.options) ? field.options : [],
            sortOrder: index
          }))
        })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(payload.error || "字段设置保存失败");
        return;
      }
      setMessage("字段设置已保存，并已为现有空白记录应用预设值。");
      router.refresh();
    });
  }

  return (
    <div className="grid">
      <div className="field-editor-guide">
        <div>
          <strong>基础定义</strong>
          <span>设置表头名称、数据类型和归属范围</span>
        </div>
        <div>
          <strong>自动填充</strong>
          <span>决定数据从哪里来，以及已有值如何处理</span>
        </div>
        <div>
          <strong>表格与权限</strong>
          <span>控制列宽、显示、必填和是否可编辑</span>
        </div>
      </div>

      <div className="field-editor-list">
        {fields.map((field, index) => {
          const selectedRule = AUTO_FILL_OPTIONS.find(
            (option) => option.value === field.autoFillRule.source
          );
          const selectedConflict = CONFLICT_OPTIONS.find(
            (option) => option.value === field.conflictPolicy
          );

          return (
            <section className="field-editor-card" key={field.id ?? `${field.key}-${index}`}>
              <header className="field-editor-card-header">
                <div className="field-editor-card-title">
                  <span className="field-editor-index">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{field.label.trim() || "未命名字段"}</h3>
                    <div className="field-editor-meta">
                      <code>{field.key || "尚未设置字段代码"}</code>
                      <span>{TYPE_LABELS[field.fieldType]}</span>
                      {field.system ? <span>系统字段</span> : null}
                    </div>
                  </div>
                </div>
                <div className="field-editor-card-actions">
                  <button
                    type="button"
                    className="btn-ghost field-order-button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`${field.label}上移`}
                  >
                    上移
                  </button>
                  <button
                    type="button"
                    className="btn-ghost field-order-button"
                    onClick={() => move(index, 1)}
                    disabled={index === fields.length - 1}
                    aria-label={`${field.label}下移`}
                  >
                    下移
                  </button>
                  <button
                    className="btn-danger field-delete-button"
                    type="button"
                    disabled={field.system}
                    title={field.system ? "系统字段不能删除" : "删除此字段"}
                    onClick={() =>
                      setFields((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index)
                      )
                    }
                  >
                    {field.system ? "不可删除" : "删除字段"}
                  </button>
                </div>
              </header>

              <div className="field-editor-section">
                <div className="field-editor-section-heading">
                  <span>01</span>
                  <div>
                    <h4>基础定义</h4>
                    <p>定义这一列展示什么，以及数据应保存在哪个范围。</p>
                  </div>
                </div>
                <div className="field-editor-grid field-editor-grid-four">
                  <div className="field">
                    <label>表头名称</label>
                    <input
                      className="input field-editor-control"
                      value={field.label}
                      onChange={(event) => patch(index, { label: event.target.value })}
                    />
                    <span className="field-helper">招聘进度表中看到的列名。</span>
                  </div>
                  <div className="field">
                    <label>字段代码</label>
                    <input
                      className="input code-input field-editor-control"
                      value={field.key}
                      disabled={Boolean(field.id)}
                      onChange={(event) =>
                        patch(index, { key: event.target.value.toLowerCase() })
                      }
                    />
                    <span className="field-helper">
                      供接口和 AI 映射使用，创建后不能修改。
                    </span>
                  </div>
                  <div className="field">
                    <label>字段类型</label>
                    <select
                      className="select field-editor-control"
                      value={field.fieldType}
                      onChange={(event) =>
                        patch(index, { fieldType: event.target.value as PositionFieldType })
                      }
                      disabled={field.system}
                    >
                      {Object.entries(TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <span className="field-helper">决定录入控件和表格展示格式。</span>
                  </div>
                  <div className="field">
                    <label>数据归属</label>
                    <select
                      className="select field-editor-control"
                      value={field.scope}
                      onChange={(event) =>
                        patch(index, { scope: event.target.value as PositionFieldScope })
                      }
                      disabled={field.system}
                    >
                      <option value={PositionFieldScope.APPLICATION}>当前岗位投递</option>
                      <option value={PositionFieldScope.CANDIDATE}>候选人主档</option>
                      <option value={PositionFieldScope.SYSTEM}>系统维护</option>
                    </select>
                    <span className="field-helper">{SCOPE_HINTS[field.scope]}</span>
                  </div>
                </div>

                {field.fieldType === PositionFieldType.SINGLE_SELECT ||
                field.fieldType === PositionFieldType.MULTI_SELECT ? (
                  <div className="field field-editor-options">
                    <label>可选项</label>
                    <input
                      className="input field-editor-control"
                      value={field.options.join(", ")}
                      onChange={(event) =>
                        patch(index, {
                          options: event.target.value
                            .split(/[,，\n]/)
                            .map((item) => item.trim())
                            .filter(Boolean)
                        })
                      }
                      placeholder="例如：待筛选, 笔试中, 面试中, 已录用"
                    />
                    <span className="field-helper">使用中文或英文逗号分隔多个选项。</span>
                  </div>
                ) : null}
              </div>

              <div className="field-editor-section">
                <div className="field-editor-section-heading">
                  <span>02</span>
                  <div>
                    <h4>自动填充</h4>
                    <p>设置新建招聘记录时该字段的数据来源。</p>
                  </div>
                </div>
                <div className="field-editor-grid field-editor-grid-three">
                  <div className="field">
                    <label>数据来源</label>
                    <select
                      className="select field-editor-control"
                      value={field.autoFillRule.source}
                      onChange={(event) =>
                        setAutoFillSource(index, event.target.value as AutoFillSource)
                      }
                      disabled={field.system && field.key !== "status"}
                    >
                      {AUTO_FILL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <span className="field-helper">{selectedRule?.hint}</span>
                  </div>

                  {field.autoFillRule.source === "STATIC" ? (
                    <div className="field">
                      <label>固定预设值</label>
                      {field.fieldType === PositionFieldType.BOOLEAN ? (
                        <select
                          className="select field-editor-control"
                          value={String(field.autoFillRule.value ?? "")}
                          onChange={(event) =>
                            patch(index, {
                              defaultValue: event.target.value,
                              autoFillRule: { source: "STATIC", value: event.target.value }
                            })
                          }
                        >
                          <option value="">请选择</option>
                          <option value="true">是</option>
                          <option value="false">否</option>
                        </select>
                      ) : field.fieldType === PositionFieldType.SINGLE_SELECT &&
                        field.options.length > 0 ? (
                        <select
                          className="select field-editor-control"
                          value={String(field.autoFillRule.value ?? "")}
                          onChange={(event) =>
                            patch(index, {
                              defaultValue: event.target.value,
                              autoFillRule: { source: "STATIC", value: event.target.value }
                            })
                          }
                        >
                          <option value="">请选择</option>
                          {field.options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="input field-editor-control"
                          type={
                            field.fieldType === PositionFieldType.NUMBER ||
                            field.fieldType === PositionFieldType.MONEY
                              ? "number"
                              : field.fieldType === PositionFieldType.DATE
                                ? "date"
                                : "text"
                          }
                          value={String(field.autoFillRule.value ?? "")}
                          onChange={(event) =>
                            patch(index, {
                              defaultValue: event.target.value,
                              autoFillRule: { source: "STATIC", value: event.target.value }
                            })
                          }
                          placeholder="请输入新记录的默认值"
                        />
                      )}
                      <span className="field-helper">仅在选择“固定预设值”时生效。</span>
                    </div>
                  ) : (
                    <div className="field-rule-summary" aria-label="当前自动填充规则说明">
                      <span>当前规则</span>
                      <strong>{selectedRule?.label}</strong>
                      <p>{selectedRule?.hint}</p>
                    </div>
                  )}

                  <div className="field">
                    <label>自动填充冲突处理</label>
                    <select
                      className="select field-editor-control"
                      value={field.conflictPolicy}
                      onChange={(event) => patch(index, { conflictPolicy: event.target.value })}
                    >
                      {CONFLICT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <span className="field-helper">{selectedConflict?.hint}</span>
                  </div>
                </div>
              </div>

              <div className="field-editor-section">
                <div className="field-editor-section-heading">
                  <span>03</span>
                  <div>
                    <h4>表格与权限</h4>
                    <p>控制该列在招聘进度表中的尺寸和使用方式。</p>
                  </div>
                </div>
                <div className="field-editor-display-grid">
                  <div className="field">
                    <label>表格列宽（像素）</label>
                    <input
                      className="input field-editor-control"
                      type="number"
                      min={100}
                      max={480}
                      step={10}
                      value={field.width}
                      onChange={(event) =>
                        patch(index, { width: Number(event.target.value) })
                      }
                    />
                    <span className="field-helper">建议 120–240，较长文本可设为 300 以上。</span>
                  </div>
                  <div className="field-editor-toggle-grid">
                    <label className="field-editor-toggle">
                      <input
                        type="checkbox"
                        checked={field.visible}
                        onChange={(event) => patch(index, { visible: event.target.checked })}
                      />
                      <span>
                        <strong>显示在进度表</strong>
                        <small>关闭后保留数据，但不展示该列。</small>
                      </span>
                    </label>
                    <label className="field-editor-toggle">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(event) => patch(index, { required: event.target.checked })}
                      />
                      <span>
                        <strong>设为必填</strong>
                        <small>人工录入时必须填写该字段。</small>
                      </span>
                    </label>
                    <label className="field-editor-toggle">
                      <input
                        type="checkbox"
                        checked={field.editable}
                        onChange={(event) => patch(index, { editable: event.target.checked })}
                        disabled={field.scope === PositionFieldScope.SYSTEM}
                      />
                      <span>
                        <strong>允许人工编辑</strong>
                        <small>系统维护字段默认不可手工修改。</small>
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <div className="settings-action-bar">
        <button className="btn-secondary" type="button" onClick={addField}>
          添加字段
        </button>
        <div className="inline-actions">
          {message ? (
            <span className={message.includes("已保存") ? "save-success" : "danger-text"} role="status">
              {message}
            </span>
          ) : null}
          <button className="btn" type="button" onClick={save} disabled={isPending}>
            {isPending ? "保存中..." : "保存字段设置"}
          </button>
        </div>
      </div>
    </div>
  );
}
