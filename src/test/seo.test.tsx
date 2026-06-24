import { describe, it, expect, vi } from "vitest";
import { Seo } from "@/components/Seo";
import { render } from "@testing-library/react";

describe("Seo", () => {
  it("sets document title", () => {
    render(<Seo title="Test Page Title" />);
    expect(document.title).toBe("Test Page Title");
  });

  it("sets meta description when provided", () => {
    render(<Seo title="Test" description="A test description" />);
    const meta = document.querySelector('meta[name="description"]') as HTMLMetaElement;
    expect(meta).toBeTruthy();
    expect(meta.content).toBe("A test description");
  });

  it("sets og:title", () => {
    render(<Seo title="OG Test" />);
    const og = document.querySelector('meta[property="og:title"]') as HTMLMetaElement;
    expect(og).toBeTruthy();
    expect(og.content).toBe("OG Test");
  });

  it("sets twitter:card", () => {
    render(<Seo title="Twitter Test" />);
    const twitter = document.querySelector('meta[name="twitter:card"]') as HTMLMetaElement;
    expect(twitter).toBeTruthy();
    expect(twitter.content).toBe("summary");
  });

  it("updates title when props change", () => {
    const { rerender } = render(<Seo title="First Title" />);
    expect(document.title).toBe("First Title");
    rerender(<Seo title="Second Title" />);
    expect(document.title).toBe("Second Title");
  });
});
