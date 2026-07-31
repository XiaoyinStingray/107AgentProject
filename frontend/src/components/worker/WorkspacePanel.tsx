/**
 * WorkspacePanel — 工作区文件面板 + 文件查看器。
 *
 * 左侧面板：显示工作区文件树，实时更新。
 * 点击文件 → 右侧滑出面板查看内容。
 * 通过 worker.file_updated 事件触发刷新。
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
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
  onFileClick,
}: {
  node: FileTreeNode;
  depth: number;
  newFiles: Set<string>;
  onFileClick?: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const isNew = newFiles.has(node.path);

  if (node.isDir) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 w-full text-left py-0.5 hover:bg-bg-primary/50
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
              onFileClick={onFileClick}
            />
          ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => onFileClick?.(node.path)}
      className={`w-full flex items-center justify-between py-0.5 hover:bg-bg-primary/50
                 transition-colors cursor-pointer ${isNew ? "animate-pulse" : ""}`}
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
    </button>
  );
}

// =============================================================================
// 主组件
// =============================================================================

interface WorkspacePanelProps {
  events: WorkerEvent[];
  runId?: string;
  connected?: boolean;
}

export default function WorkspacePanel({ events, runId, connected }: WorkspacePanelProps) {
  // 文件查看器状态
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  // 点击文件 → 获取内容
  const openFile = useCallback(async (path: string) => {
    if (!runId) return;
    setViewingFile(path);
    setFileLoading(true);
    setFileContent(null);
    try {
      const resp = await fetch(`/api/workers/${runId}/files/${encodeURIComponent(path)}`);
      if (resp.ok) {
        const data = await resp.json();
        setFileContent(data.content);
      } else {
        setFileContent("(无法读取文件)");
      }
    } catch {
      setFileContent("(网络错误)");
    } finally {
      setFileLoading(false);
    }
  }, [runId]);

  // 关闭文件查看器（同时解锁）
  const closeFile = useCallback(async () => {
    if (viewingFile && runId) {
      try { await fetch(`/api/workers/${runId}/unlock?path=${encodeURIComponent(viewingFile)}`, { method: "POST" }); } catch {}
    }
    setViewingFile(null);
    setFileContent(null);
    setEditing(false);
  }, [viewingFile, runId]);

  // 进入编辑模式
  const startEdit = useCallback(() => {
    setEditContent(fileContent || "");
    setEditing(true);
  }, [fileContent]);

  // 保存编辑
  const saveEdit = useCallback(async () => {
    if (!viewingFile || !runId) return;
    setSaving(true);
    try {
      const resp = await fetch(`/api/workers/${runId}/files/${encodeURIComponent(viewingFile)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: viewingFile, content: editContent, lock: false }),
      });
      if (resp.ok) {
        setFileContent(editContent);
        setEditing(false);
      }
    } catch {} finally { setSaving(false); }
  }, [viewingFile, runId, editContent]);

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
    <div className="relative flex flex-col h-full">
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
              onFileClick={openFile}
            />
          ))
        )}
      </div>

      {/* 文件查看器滑出面板 */}
      {viewingFile && (
        <div className="absolute right-0 top-0 bottom-0 w-[400px] bg-bg-card border-l-2 border-border
                        shadow-2xl z-30 flex flex-col"
             style={{boxShadow: "-4px 0 20px rgba(0,0,0,0.5)"}}>
          {/* 查看器标题栏 */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-bg-secondary">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs">
                {viewingFile.endsWith(".md") ? "📝" :
                 viewingFile.endsWith(".py") ? "🐍" :
                 viewingFile.endsWith(".json") ? "📋" : "📄"}
              </span>
              <span className="text-xs font-mono text-text-primary truncate" title={viewingFile}>
                {viewingFile}
              </span>
              {editing && <span className="text-xs text-yellow-400">[编辑中]</span>}
            </div>
            <div className="flex items-center gap-1">
              {!editing ? (
                <button onClick={startEdit}
                        className="text-xs font-mono px-2 py-0.5 rounded border border-border
                                   text-text-muted hover:text-cyan-400 hover:border-cyan-700/30 transition-colors">
                  编辑
                </button>
              ) : (
                <>
                  <button onClick={saveEdit} disabled={saving}
                          className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-700
                                     hover:bg-cyan-600 text-white transition-colors disabled:opacity-50">
                    {saving ? "保存中…" : "保存"}
                  </button>
                  <button onClick={() => setEditing(false)}
                          className="text-xs font-mono px-2 py-0.5 rounded border border-border
                                     text-text-muted hover:text-text-secondary transition-colors">
                    取消
                  </button>
                </>
              )}
              <button onClick={closeFile}
                      className="text-text-muted hover:text-text-primary text-lg leading-none px-1 ml-1">
                ✕
              </button>
            </div>
          </div>
          {/* 文件内容 / 编辑器 */}
          <div className="flex-1 overflow-y-auto p-3">
            {fileLoading ? (
              <p className="text-xs text-text-muted font-mono">加载中…</p>
            ) : editing ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full h-full min-h-[300px] bg-bg-primary border border-border rounded
                           text-xs font-mono text-text-primary p-2 resize-none
                           focus:outline-none focus:border-cyan-700/50"
                spellCheck={false}
              />
            ) : fileContent !== null ? (
              <pre className="text-xs font-mono text-text-secondary whitespace-pre-wrap break-all">
                {fileContent}
              </pre>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
