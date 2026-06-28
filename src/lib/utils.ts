export function formatDateTime(value?: string | Date | null) {
  if (!value) {
    return "未记录";
  }

  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatDate(value?: string | Date | null) {
  if (!value) {
    return "未设置";
  }

  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function formatRelativeDays(value?: string | Date | null) {
  if (!value) {
    return "暂无";
  }

  const date = typeof value === "string" ? new Date(value) : value;
  const diffMs = date.getTime() - Date.now();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return "今天";
  }

  if (days > 0) {
    return `${days} 天后`;
  }

  return `${Math.abs(days)} 天前`;
}

export function toArray(value: unknown): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter(Boolean).map(String);
  }

  if (typeof value === "string") {
    return value
      .split(/[、,，/]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

export function clampConfidence(value: number) {
  return Math.max(0.35, Math.min(0.99, Number(value.toFixed(2))));
}
