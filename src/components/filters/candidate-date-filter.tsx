"use client";

import { type ChangeEvent, useMemo, useState } from "react";

export type CandidateDatePreset = "none" | "day" | "week" | "quarter" | "custom";

function currentDateString() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function quarterOf(dateValue: string) {
  const date = new Date(`${dateValue || currentDateString()}T00:00:00`);
  return Math.floor(date.getMonth() / 3) + 1;
}

function yearOf(dateValue: string) {
  return Number((dateValue || currentDateString()).slice(0, 4));
}

function formatRangeHint(preset: CandidateDatePreset, anchor: string) {
  if (!anchor || preset === "none" || preset === "custom") return "";
  const date = new Date(`${anchor}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";

  const from = new Date(date);
  const to = new Date(date);

  if (preset === "week") {
    const day = from.getDay() || 7;
    from.setDate(from.getDate() - day + 1);
    to.setTime(from.getTime());
    to.setDate(from.getDate() + 6);
  } else if (preset === "quarter") {
    const startMonth = Math.floor(from.getMonth() / 3) * 3;
    from.setMonth(startMonth, 1);
    to.setFullYear(from.getFullYear(), startMonth + 3, 0);
  }

  return `${from.toLocaleDateString("zh-CN")} 至 ${to.toLocaleDateString("zh-CN")}`;
}

export function CandidateDateFilter({
  initialPreset,
  initialAnchor,
  initialFrom,
  initialTo
}: {
  initialPreset: CandidateDatePreset;
  initialAnchor: string;
  initialFrom: string;
  initialTo: string;
}) {
  const today = currentDateString();
  const [preset, setPreset] = useState<CandidateDatePreset>(initialPreset);
  const [anchor, setAnchor] = useState(initialAnchor || today);
  const [quarterYear, setQuarterYear] = useState(yearOf(initialAnchor));
  const [quarter, setQuarter] = useState(quarterOf(initialAnchor));
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  const resolvedAnchor = useMemo(() => {
    if (preset === "quarter") return `${quarterYear}-${String((quarter - 1) * 3 + 1).padStart(2, "0")}-01`;
    return anchor;
  }, [anchor, preset, quarter, quarterYear]);
  const rangeHint = formatRangeHint(preset, resolvedAnchor);
  const currentYear = new Date().getFullYear();
  const years = Array.from(
    new Set([
      ...Array.from({ length: 11 }, (_, index) => currentYear - 5 + index),
      quarterYear
    ])
  ).sort((left, right) => left - right);

  function updatePreset(
    event: ChangeEvent<HTMLSelectElement>
  ) {
    setPreset(event.target.value as CandidateDatePreset);
  }

  return (
    <div className="date-filter-group">
      <div className="field">
        <label htmlFor="candidate-date-preset">日期筛选</label>
        <select
          id="candidate-date-preset"
          className="select"
          name="datePreset"
          value={preset}
          onChange={updatePreset}
        >
          <option value="none">全部</option>
          <option value="day">日</option>
          <option value="week">周</option>
          <option value="quarter">季</option>
          <option value="custom">自选时间段</option>
        </select>
      </div>

      {preset === "day" || preset === "week" ? (
        <div className="field date-filter-value">
          <label htmlFor="candidate-date-anchor">
            {preset === "day" ? "选择投递日期" : "选择该周内任意一天"}
          </label>
          <input
            id="candidate-date-anchor"
            className="input"
            type="date"
            name="dateAnchor"
            value={anchor}
            required
            onChange={(event) => setAnchor(event.target.value)}
          />
          {rangeHint ? <span className="field-helper">实际筛选范围：{rangeHint}</span> : null}
        </div>
      ) : null}

      {preset === "quarter" ? (
        <div className="date-filter-quarter">
          <div className="field">
            <label htmlFor="candidate-quarter-year">年份</label>
            <select
              id="candidate-quarter-year"
              className="select"
              value={quarterYear}
              onChange={(event) => setQuarterYear(Number(event.target.value))}
            >
              {years.map((year) => <option key={year} value={year}>{year} 年</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="candidate-quarter-value">季度</label>
            <select
              id="candidate-quarter-value"
              className="select"
              value={quarter}
              onChange={(event) => setQuarter(Number(event.target.value))}
            >
              <option value={1}>第一季度</option>
              <option value={2}>第二季度</option>
              <option value={3}>第三季度</option>
              <option value={4}>第四季度</option>
            </select>
          </div>
          <input type="hidden" name="dateAnchor" value={resolvedAnchor} />
          {rangeHint ? <span className="field-helper date-filter-quarter-hint">实际筛选范围：{rangeHint}</span> : null}
        </div>
      ) : null}

      {preset === "custom" ? (
        <div className="date-filter-custom">
          <div className="field">
            <label htmlFor="candidate-date-from">开始日期</label>
            <input
              id="candidate-date-from"
              className="input"
              type="date"
              name="dateFrom"
              value={from}
              max={to || undefined}
              required
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="candidate-date-to">结束日期</label>
            <input
              id="candidate-date-to"
              className="input"
              type="date"
              name="dateTo"
              value={to}
              min={from || undefined}
              required
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <span className="field-helper date-filter-custom-hint">开始日期不能晚于结束日期。</span>
        </div>
      ) : null}

      {preset !== "none" ? (
        <div className="date-filter-rule" role="note">
          统计投递日期在范围内，或投递更早但筛选范围内仍处于流程中的候选人。
        </div>
      ) : null}
    </div>
  );
}
