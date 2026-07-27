import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App router configuration", () => {
  it("opts into React Router v7 future behavior without warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );

    const routerWarnings = warn.mock.calls
      .flat()
      .map(String)
      .filter(
        (message) =>
          message.includes("v7_startTransition") ||
          message.includes("v7_relativeSplatPath"),
      );

    expect(routerWarnings).toEqual([]);
  });
});
