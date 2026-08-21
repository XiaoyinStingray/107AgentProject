import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import WorkspacePanel from "./WorkspacePanel";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WorkspacePanel real file listing", () => {
  it("shows a manually added backend file without a file_updated event", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        run_id: "run-manual",
        files: [{ path: "team-report.md", size: 9939, modified_at: "2026-08-21" }],
      }),
    }));

    render(<WorkspacePanel events={[]} runId="run-manual" connected={false} />);

    expect(await screen.findByText("team-report.md")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/workers/run-manual/files");
  });

  it("refreshes the authoritative file list from the toolbar button", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ run_id: "run-refresh", files: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          run_id: "run-refresh",
          files: [{ path: "manual-input.md", size: 12, modified_at: "2026-08-21" }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<WorkspacePanel events={[]} runId="run-refresh" connected={false} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      screen.getByRole("button", { name: "刷新工作区文件" }).click();
    });

    expect(await screen.findByText("manual-input.md")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
