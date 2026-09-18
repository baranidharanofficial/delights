"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The jump-link bar, with the current section highlighted as the page scrolls.
 *
 * Plain anchors already get you down the page — this only adds the highlight,
 * so it degrades to the old behaviour if JS never runs. `IntersectionObserver`
 * over `getBoundingClientRect` on scroll because thirteen sections is cheap to
 * watch passively and expensive to poll.
 */
export function SectionNav({
  sections,
}: {
  sections: { id: string; name: string }[];
}) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const visible = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.set(entry.target.id, entry.boundingClientRect.top);
          } else {
            visible.delete(entry.target.id);
          }
        }

        if (visible.size === 0) return;
        const topmost = [...visible.entries()].sort((a, b) => a[1] - b[1])[0];
        setActiveId(topmost[0]);
      },
      // Counts a section as "current" once it has cleared the sticky bar, and
      // for as long as its heading is still in the top half of the viewport.
      { rootMargin: "-84px 0px -60% 0px", threshold: 0 },
    );

    for (const { id } of sections) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sections]);

  useEffect(() => {
    const active = listRef.current?.querySelector('[aria-current="true"]');
    active?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [activeId]);

  return (
    <ul ref={listRef} className="flex gap-2">
      {sections.map(({ id, name }) => {
        const isActive = id === activeId;
        return (
          <li key={id}>
            <a
              href={`#${id}`}
              aria-current={isActive}
              className={`block rounded-full border px-4 py-1.5 text-sm whitespace-nowrap transition-colors ${
                isActive
                  ? "border-accent-strong/40 bg-accent-strong text-background"
                  : "border-line text-muted hover:border-accent/60 hover:text-foreground"
              }`}
            >
              {name}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
