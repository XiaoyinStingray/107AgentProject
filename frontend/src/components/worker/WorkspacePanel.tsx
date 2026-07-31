/**
 * WorkspacePanel — 工作区文件面板。
 *
 * 左侧面板：显示工作区文件树，实时更新。
 * 通过 worker.file_updated 事件触发刷新。
 */

import React, { useState, useEffect, useMemo } from "react";
import type { WorkerEvent } from "../../api/workers";

// =============================================================================
// 类型
// =============================================================================

interface FileEntry {
  path: string;
  size: number;
}

interface FileTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: FileTreeNode[];
  size?: number;
}

// =============================================================================
// 辅助函数
// =============================================================================

function buildFileTree(files: FileEntry[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      const name = parts[i];
      const fullPath = parts.slice(0, i + 1).join("/");

      let existing = current.find((n) => n.name === name);
      if (!existing) {
        existing = {
          name,
          path: fullPath,
          isDir: !isLast,
          children: [],
          size: isLast ? file.size : undefined,
        };
        current.push(existing);
      }
      current = existing.children;
    }
  }

  return root;
}

// =============================================================================
// 子组件: 文件树节点
// =============================================================================

function TreeNode({
  node,
  depth,
  newFiles,
}: {
  node: FileTreeNode;
  depth: number;
  newFiles: Set<string>;
}) {
  const [expanded, setExpanded] = useState(true);
  const isNew = newFiles.has(node.path);

  if (node.isDir) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 w-full text-left py-0.5 hover:bg-surface-dark/50
                     transition-colors"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          <span className="text-xs">{expanded ? "📂" : "📁"}</span>
          <span className="text-xs font-mono text-text-secondary truncate">
            {node.name}/
          </span>
        </button>
        {expanded &&
          node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              newFiles={newFiles}
            />
          ))}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-between py-0.5 hover:bg-surface-dark/50
                 transition-colors ${isNew ? "animate-pulse" : ""}`}
      style={{ paddingLeft: `${depth * 12 + 4}px`, paddingRight: "4px" }}
    >
      <div className="flex items-center gap-1 min-w-0">
        <span className="text-xs">
          {node.name.endsWith(".md")
            ? "📝"
            : node.name.endsWith(".py")
              ? "🐍"
              : node.name.endsWith(".json")
                ? "📋"
                : node.name.endsWith(".html")
                  ? "🌐"
                  : node.name.endsWith(".csv")
                    ? "📊"
                    : "📄"}
        </span>
        <span
          className={`text-xs font-mono truncate ${isNew ? "text-emerald-400" : "text-text-secondary"}`}
          title={node.path}
        >
          {node.name}
        </span>
      </div>
      {node.size !== undefined && (
        <span className="text-xs text-text-muted font-mono ml-2 shrink-0">
          {node.size >= 1024
            ? `${(node.size / 1024).toFixed(1)}KB`
            : `${node.size}B`}
        </span>
      )}
    </div>
  );
}

// =============================================================================
// 主组件
// =============================================================================

interface WorkspacePanelProps {
  events: WorkerEvent[];
}

export default function WorkspacePanel({ events }: WorkspacePanelProps) {
  // 从事件中提取文件信息
  const files = useMemo(() => {
    const seen = new Map<string, number>();
    for (const event of events) {
      if (event.type === "worker.file_updated") {
        const d = event.data as Record<string, unknown>;
        const fileList = (d.files as Array<{ path: string; size: number }>) || [];
        for (const f of fileList) {
          seen.set(f.path, f.size);
        }
      }
    }
    return Array.from(seen.entries()).map(([path, size]) => ({ path, size }));
  }, [events]);

  // 最近新增的文件（最后 1 个 file_updated 事件中的文件）
  const [newFiles, setNewFiles] = useState<Set<string>>(new Set());

  useEffect(() => {
    const lastFileUpdate = [...events].reverse().find(
      (e) => e.type === "worker.file_updated"
    );
    if (lastFileUpdate) {
      const d = lastFileUpdate.data as Record<string, unknown>;
      const fileList = (d.files as Array<{ path: string }>) || [];
      const newSet = new Set(fileList.map((f) => f.path));
      setNewFiles(newSet);
      // 3 秒后移除闪烁
      const timer = setTimeout(() => setNewFiles(new Set()), 3000);
      return () => clearTimeout(timer);
    }
  }, [events]);

  // 构建文件树
  const tree = useMemo(() => buildFileTree(files), [files]);

  return (
    <div className="flex flex-col h-full">
      {/* 标题 */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-text-secondary font-semibold">
            📁 工作区文件
          </span>
          <span className="text-xs font-mono text-text-muted">
            {files.length}
          </span>
        </div>
      </div>

      {/* 文件树 */}
      <div className="flex-1 overflow-y-auto py-1">
        {tree.length === 0 ? (
          <div className="px-3 py-4 text-center">
            <span className="text-2xl block mb-1">📂</span>
            <p className="text-xs font-mono text-text-muted">
              工作区为空
            </p>
            <p className="text-xs font-mono text-text-muted mt-0.5">
              等待 Agent 创建文件...
            </p>
          </div>
        ) : (
          tree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              newFiles={newFiles}
            />
          ))
        )}
      </div>
    </div>
  );
}
