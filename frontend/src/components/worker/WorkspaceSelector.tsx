/**
 * WorkspaceSelector — 工作区类型选择器。
 *
 * 本地模式：目录路径输入
 * 云端模式：SSH 配置表单 + 连接测试
 */

import React, { useState, useCallback } from "react";

// =============================================================================
// 类型
// =============================================================================

export type WorkspaceType = "local" | "cloud";

export interface WorkspaceConfig {
  type: WorkspaceType;
  // Local
  path?: string;
  // Cloud
  host?: string;
  port?: number;
  user?: string;
  key?: string;
}

interface WorkspaceSelectorProps {
  value: WorkspaceConfig;
  onChange: (config: WorkspaceConfig) => void;
  disabled?: boolean;
}

// =============================================================================
// 主组件
// =============================================================================

export default function WorkspaceSelector({
  value,
  onChange,
  disabled = false,
}: WorkspaceSelectorProps) {
  const [testStatus, setTestStatus] = useState<{
    testing: boolean;
    result: string | null;
    success: boolean;
  }>({ testing: false, result: null, success: false });

  // 测试 SSH 连接
  const testConnection = useCallback(async () => {
    if (!value.host || !value.user || !value.key) {
      setTestStatus({
        testing: false,
        result: "请填写主机地址、用户名和密钥",
        success: false,
      });
      return;
    }

    setTestStatus({ testing: true, result: null, success: false });

    try {
      const resp = await fetch("/api/workers/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: value.host,
          port: value.port || 22,
          user: value.user,
          key: value.key,
          path: value.path || "/data/workspaces",
        }),
      });

      const data = await resp.json();
      if (data.success) {
        setTestStatus({
          testing: false,
          result: `连接成功 (${data.latency_ms}ms)`,
          success: true,
        });
      } else {
        setTestStatus({
          testing: false,
          result: `连接失败: ${data.message}`,
          success: false,
        });
      }
    } catch (e) {
      setTestStatus({
        testing: false,
        result: `请求失败: ${e instanceof Error ? e.message : "未知错误"}`,
        success: false,
      });
    }
  }, [value]);

  return (
    <div className="space-y-3">
      {/* 类型切换 */}
      <div className="flex gap-2">
        <button
          onClick={() => onChange({ ...value, type: "local" })}
          disabled={disabled}
          className={`px-3 py-1.5 text-xs font-mono rounded border transition-colors ${
            value.type === "local"
              ? "border-cyan-700/50 bg-cyan-900/20 text-cyan-400"
              : "border-border text-text-muted hover:text-text-secondary"
          }`}
        >
          💻 本地
        </button>
        <button
          onClick={() => onChange({ ...value, type: "cloud" })}
          disabled={disabled}
          className={`px-3 py-1.5 text-xs font-mono rounded border transition-colors ${
            value.type === "cloud"
              ? "border-cyan-700/50 bg-cyan-900/20 text-cyan-400"
              : "border-border text-text-muted hover:text-text-secondary"
          }`}
        >
          ☁️ 云端 (SSH)
        </button>
      </div>

      {/* 本地配置 */}
      {value.type === "local" && (
        <div>
          <label className="block text-xs font-mono text-text-muted mb-1">
            工作区目录（留空使用默认 ~/workspaces/）
          </label>
          <input
            type="text"
            value={value.path || ""}
            onChange={(e) => onChange({ ...value, path: e.target.value })}
            placeholder="~/projects/my-workspace"
            disabled={disabled}
            className="w-full bg-bg-secondary border border-border rounded px-3 py-1.5
                       text-xs font-mono text-text-primary placeholder-text-muted
                       focus:outline-none focus:border-cyan-700/50"
          />
        </div>
      )}

      {/* 云端配置 */}
      {value.type === "cloud" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-mono text-text-muted mb-0.5">
                主机地址 *
              </label>
              <input
                type="text"
                value={value.host || ""}
                onChange={(e) => onChange({ ...value, host: e.target.value })}
                placeholder="192.168.1.100"
                disabled={disabled}
                className="w-full bg-bg-secondary border border-border rounded px-2 py-1
                           text-xs font-mono text-text-primary placeholder-text-muted
                           focus:outline-none focus:border-cyan-700/50"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-text-muted mb-0.5">
                端口
              </label>
              <input
                type="number"
                value={value.port || 22}
                onChange={(e) =>
                  onChange({ ...value, port: parseInt(e.target.value) || 22 })
                }
                disabled={disabled}
                className="w-full bg-bg-secondary border border-border rounded px-2 py-1
                           text-xs font-mono text-text-primary
                           focus:outline-none focus:border-cyan-700/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-text-muted mb-0.5">
              用户名 *
            </label>
            <input
              type="text"
              value={value.user || ""}
              onChange={(e) => onChange({ ...value, user: e.target.value })}
              placeholder="ubuntu"
              disabled={disabled}
              className="w-full bg-bg-secondary border border-border rounded px-3 py-1.5
                         text-xs font-mono text-text-primary placeholder-text-muted
                         focus:outline-none focus:border-cyan-700/50"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-text-muted mb-0.5">
              SSH 私钥 *（PEM 内容——仅存内存，不保存）
            </label>
            <textarea
              value={value.key || ""}
              onChange={(e) => onChange({ ...value, key: e.target.value })}
              placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;..."
              rows={3}
              disabled={disabled}
              className="w-full bg-bg-secondary border border-border rounded px-3 py-1.5
                         text-xs font-mono text-text-primary placeholder-text-muted
                         resize-none focus:outline-none focus:border-cyan-700/50"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-text-muted mb-0.5">
              云端路径
            </label>
            <input
              type="text"
              value={value.path || ""}
              onChange={(e) => onChange({ ...value, path: e.target.value })}
              placeholder="/data/workspaces"
              disabled={disabled}
              className="w-full bg-bg-secondary border border-border rounded px-3 py-1.5
                         text-xs font-mono text-text-primary placeholder-text-muted
                         focus:outline-none focus:border-cyan-700/50"
            />
          </div>

          {/* 连接测试按钮 */}
          <div className="flex items-center gap-2">
            <button
              onClick={testConnection}
              disabled={disabled || testStatus.testing}
              className="px-3 py-1.5 text-xs font-mono rounded border border-border
                         text-text-secondary hover:text-cyan-400 hover:border-cyan-700/30
                         transition-colors disabled:opacity-50"
            >
              {testStatus.testing ? "⏳ 测试中..." : "🔌 测试连接"}
            </button>
            {testStatus.result && (
              <span
                className={`text-xs font-mono ${
                  testStatus.success ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {testStatus.result}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
