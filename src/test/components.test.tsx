import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Skeleton, SkeletonCard, SkeletonTable, PageSkeleton } from "@/components/Skeleton";
import { Seo } from "@/components/Seo";
import NotFound from "@/pages/NotFound";
import ErrorBoundary from "@/components/ErrorBoundary";

describe("Skeleton Components", () => {
  it("Skeleton renders correct number of lines", () => {
    const { container } = render(<Skeleton lines={5} />);
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBe(5);
  });

  it("Skeleton renders default 3 lines", () => {
    const { container } = render(<Skeleton />);
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBe(3);
  });

  it("SkeletonCard renders", () => {
    const { container } = render(<SkeletonCard />);
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("SkeletonTable renders correct rows and cols", () => {
    const { container } = render(<SkeletonTable rows={4} cols={3} />);
    const rows = container.querySelectorAll(".flex.gap-4");
    expect(rows.length).toBe(5); // header + 4 rows
  });

  it("PageSkeleton renders", () => {
    const { container } = render(<PageSkeleton />);
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("Skeleton applies custom className", () => {
    const { container } = render(<Skeleton className="custom-class" />);
    expect(container.querySelector(".custom-class")).toBeTruthy();
  });
});

describe("Seo Component", () => {
  it("sets document title", () => {
    render(<Seo title="Test Page" />);
    expect(document.title).toBe("Test Page");
  });

  it("sets meta description", () => {
    render(<Seo title="Test" description="Test description" />);
    const meta = document.querySelector('meta[name="description"]') as HTMLMetaElement;
    expect(meta).toBeTruthy();
    expect(meta.content).toBe("Test description");
  });

  it("sets og tags", () => {
    render(<Seo title="OG Test" description="OG desc" />);
    const ogTitle = document.querySelector('meta[property="og:title"]') as HTMLMetaElement;
    const ogDesc = document.querySelector('meta[property="og:description"]') as HTMLMetaElement;
    expect(ogTitle.content).toBe("OG Test");
    expect(ogDesc.content).toBe("OG desc");
  });

  it("sets twitter card", () => {
    render(<Seo title="Twitter Test" description="Twitter desc" />);
    const card = document.querySelector('meta[name="twitter:card"]') as HTMLMetaElement;
    expect(card.content).toBe("summary");
  });

  it("updates title when props change", () => {
    const { rerender } = render(<Seo title="First" />);
    expect(document.title).toBe("First");
    rerender(<Seo title="Second" />);
    expect(document.title).toBe("Second");
  });
});

describe("NotFound Page", () => {
  it("renders 404 heading", () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("shows page not found message", () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );
    expect(screen.getByText("Page not found")).toBeInTheDocument();
  });

  it("has search input", () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });

  it("has Go Home link", () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );
    expect(screen.getByText("Go Home")).toBeInTheDocument();
  });

  it("has Go Back button", () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );
    expect(screen.getByText("Go Back")).toBeInTheDocument();
  });
});

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <div>Working</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("Working")).toBeInTheDocument();
  });

  it("renders fallback on error with custom title", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const Throw = () => { throw new Error("Crash"); };
    render(
      <ErrorBoundary fallbackTitle="Custom Fallback">
        <Throw />
      </ErrorBoundary>
    );
    expect(screen.getByText("Custom Fallback")).toBeInTheDocument();
    expect(screen.getByText("Crash")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("renders default fallback title", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const Throw = () => { throw new Error("Boom"); };
    render(
      <ErrorBoundary>
        <Throw />
      </ErrorBoundary>
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    spy.mockRestore();
  });
});
