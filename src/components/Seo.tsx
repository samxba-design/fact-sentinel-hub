import { useEffect } from "react";

interface SeoProps {
  title: string;
  description?: string;
  ogType?: string;
}

/**
 * Sets document title and meta tags for SEO.
 * Add to any page to improve search engine indexing and social sharing.
 */
export function Seo({ title, description, ogType = "website" }: SeoProps) {
  useEffect(() => {
    document.title = title;

    const setMeta = (name: string, content: string, attr: "name" | "property" = "name") => {
      let tag = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute(attr, name);
        document.head.appendChild(tag);
      }
      tag.content = content;
    };

    if (description) {
      setMeta("description", description);
      setMeta("og:description", description, "property");
    }
    setMeta("og:title", title, "property");
    setMeta("og:type", ogType, "property");
    setMeta("twitter:card", "summary");
    setMeta("twitter:title", title);
    if (description) setMeta("twitter:description", description);
  }, [title, description, ogType]);

  return null;
}
