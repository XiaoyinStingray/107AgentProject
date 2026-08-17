import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { useFeatureAnchor } from "./useFeatureAnchor";


function Harness() {
  const navigate = useNavigate();
  useFeatureAnchor();
  return (
    <>
      <button onClick={() => navigate("/scene#director")}>导演</button>
      <button onClick={() => navigate("/scene#checkpoints")}>存档</button>
      <div id="section-director">导演面板</div>
      <div id="section-checkpoints">存档面板</div>
    </>
  );
}

describe("useFeatureAnchor", () => {
  it("repositions for repeated hash changes on the same route", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(
      <MemoryRouter
        initialEntries={["/scene"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Harness />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "导演" }));
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: "smooth", block: "nearest" });
    fireEvent.click(screen.getByRole("button", { name: "存档" }));
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });
});
