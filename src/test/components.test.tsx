import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ErrorBoundary from "@/components/ErrorBoundary";

function ThrowComponent() {
  throw new Error("Test error");
}

function NormalComponent() {
  return <div>Working component</div>;
}

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <NormalComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText("Working component")).toBeInTheDocument();
  });

  it("renders fallback when child throws", () => {
    // Suppress console.error for this test
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary fallbackTitle="Custom error title">
        <ThrowComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText("Custom error title")).toBeInTheDocument();
    expect(screen.getByText("Test error")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("renders default title when no fallbackTitle provided", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    spy.mockRestore();
  });
});

describe("NotFound", () => {
  it("renders 404 page", async () => {
    const { default: NotFound } = await import("@/pages/NotFound");
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText("Page not found")).toBeInTheDocument();
  });

  it("has a search input", async () => {
    const { default: NotFound } = await import("@/pages/NotFound");
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });

  it("has a link to home", async () => {
    const { default: NotFound } = await import("@/pages/NotFound");
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );
    expect(screen.getByText("Go Home")).toBeInTheDocument();
  });
});

describe("Skeleton", () => {
  it("renders correct number of lines", async () => {
    const { Skeleton } = await import("@/components/Skeleton");
    const { container } = render(<Skeleton lines={5} />);
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBe(5);
  });

  it("renders SkeletonCard", async () => {
    const { SkeletonCard } = await import("@/components/Skeleton");
    const { container } = render(<SkeletonCard />);
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("renders SkeletonTable with correct rows", async () => {
    const { SkeletonTable } = await import("@/components/Skeleton");
    const { container } = render(<SkeletonTable rows={3} cols={2} />);
    const rows = container.querySelectorAll(".flex.gap-4");
    // header + 3 rows = 4
    expect(rows.length).toBe(4);
  });

  it("renders PageSkeleton", async () => {
    const { PageSkeleton } = await import("@/components/Skeleton");
    const { container } = render(<PageSkeleton />);
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });
});
