"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { authFetch } from "@/lib/auth/client-session";
import {
  SIDEBAR_NAV_ITEMS,
  type SidebarSettings
} from "@/lib/sidebar-settings";

export function SidebarSettingsEditor({
  open,
  settings,
  onClose,
  onSaved
}: {
  open: boolean;
  settings: SidebarSettings;
  onClose: () => void;
  onSaved: (settings: SidebarSettings) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(settings);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setDraft(settings);
      setMessage(null);
      setError(null);
    }
  }, [open, settings]);

  if (!open) return null;

  function updateNavLabel(id: keyof SidebarSettings["navLabels"], label: string) {
    setDraft((current) => ({
      ...current,
      navLabels: {
        ...current.navLabels,
        [id]: label
      }
    }));
  }

  function save() {
    setMessage(null);
    setError(null);

    startTransition(async () => {
      try {
        const response = await authFetch("/api/settings/sidebar", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft)
        });
        const payload = (await response.json()) as SidebarSettings & { error?: string };

        if (!response.ok) {
          setError(payload.error || "侧边栏设置保存失败");
          return;
        }

        setMessage("侧边栏设置已保存");
        onSaved(payload);
        router.refresh();
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "侧边栏设置保存失败");
      }
    });
  }

  return (
    <div
      className="drawer-overlay sidebar-settings-overlay"
      onClick={() => {
        if (!isPending) onClose();
      }}
    >
      <aside
        className="drawer-panel sidebar-settings-panel"
        aria-label="编辑侧边栏"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <h3>编辑侧边栏</h3>
            <p>管理员可以调整系统名称、说明文案和左侧菜单显示名称。</p>
          </div>
          <button
            className="drawer-close"
            type="button"
            aria-label="关闭侧边栏设置"
            disabled={isPending}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="drawer-body sidebar-settings-body">
          <section className="drawer-section">
            <h4>品牌信息</h4>
            <div className="field">
              <label htmlFor="sidebar-brand-title">系统名称</label>
              <input
                id="sidebar-brand-title"
                className="input"
                value={draft.brandTitle}
                maxLength={60}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, brandTitle: event.target.value }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="sidebar-brand-description">说明文案</label>
              <textarea
                id="sidebar-brand-description"
                className="textarea"
                rows={4}
                value={draft.brandDescription}
                maxLength={240}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, brandDescription: event.target.value }))
                }
              />
            </div>
          </section>

          <section className="drawer-section">
            <h4>菜单名称</h4>
            <div className="sidebar-nav-label-grid">
              {SIDEBAR_NAV_ITEMS.map((item) => (
                <div className="field" key={item.id}>
                  <label htmlFor={`sidebar-nav-${item.id}`}>
                    {item.defaultLabel}
                    {item.adminOnly ? <span className="field-label-note">管理员菜单</span> : null}
                  </label>
                  <input
                    id={`sidebar-nav-${item.id}`}
                    className="input"
                    value={draft.navLabels[item.id]}
                    maxLength={30}
                    onChange={(event) => updateNavLabel(item.id, event.target.value)}
                  />
                </div>
              ))}
            </div>
          </section>

          {error ? <div className="alert danger" role="alert">{error}</div> : null}
          {message ? <div className="alert info" role="status">{message}</div> : null}
        </div>

        <div className="drawer-actions sidebar-settings-footer">
          <button className="btn-secondary" type="button" onClick={onClose} disabled={isPending}>
            取消
          </button>
          <button className="btn" type="button" onClick={save} disabled={isPending}>
            {isPending ? "保存中..." : "保存侧边栏设置"}
          </button>
        </div>
      </aside>
    </div>
  );
}
