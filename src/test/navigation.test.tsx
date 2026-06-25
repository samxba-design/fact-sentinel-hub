import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NotFound from "@/pages/NotFound";

describe("NotFound Navigation", () => {
  it("search input updates on type", () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );
    const input = screen.getByPlaceholderText("Search...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "narratives" } });
    expect(input.value).toBe("narratives");
  });

  it("Go Home link points to /", () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );
    const link = screen.getByText("Go Home").closest("a");
    expect(link).toHaveAttribute("href", "/");
  });

  it("Go Back button exists and is clickable", () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );
    const btn = screen.getByText("Go Back");
    expect(btn.tagName).toBe("BUTTON");
  });

  it("form submits without crashing", () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );
    const form = document.querySelector("form");
    expect(form).toBeTruthy();
    fireEvent.submit(form!);
    // Should not crash — navigation happens in memory router
  });
});
