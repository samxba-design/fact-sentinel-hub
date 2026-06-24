import { describe, it, expect } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import NotFound from "@/pages/NotFound";
import ErrorBoundary from "@/components/ErrorBoundary";

describe("Routing Components", () => {
  it("renders 404 page at unknown route", () => {
    render(
      <MemoryRouter initialEntries={["/nonexistent-page"]}>
        <Routes>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText("Page not found")).toBeInTheDocument();
  });

  it("404 page has search and home link", () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
    expect(screen.getByText("Go Home")).toBeInTheDocument();
    expect(screen.getByText("Go Back")).toBeInTheDocument();
  });

  it("ErrorBoundary catches errors and shows fallback", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const ThrowComponent = () => {
      throw new Error("Test crash");
    };

    render(
      <ErrorBoundary fallbackTitle="Crash fallback">
        <ThrowComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText("Crash fallback")).toBeInTheDocument();
    expect(screen.getByText("Test crash")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("ErrorBoundary renders children normally when no error", () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("Child content")).toBeInTheDocument();
  });
});
