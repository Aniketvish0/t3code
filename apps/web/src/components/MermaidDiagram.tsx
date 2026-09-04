import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { RenderResult } from "mermaid";

import { serializeMarkdownCodeFence } from "../markdown-clipboard";

type MermaidTheme = "light" | "dark";

// Mermaid configuration is global, so initialization and rendering must stay paired.
let mermaidRenderQueue = Promise.resolve();

export function renderMermaidDiagram(
  id: string,
  code: string,
  theme: MermaidTheme,
  isActive: () => boolean = () => true,
) {
  const render = async () => {
    if (!isActive()) return null;
    const { default: mermaid } = await import("mermaid");
    if (!isActive()) return null;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      secure: [
        "secure",
        "securityLevel",
        "startOnLoad",
        "maxTextSize",
        "suppressErrorRendering",
        "maxEdges",
        "themeCSS",
        "fontFamily",
        "altFontFamily",
      ],
      theme: theme === "dark" ? "dark" : "default",
    });
    return mermaid.render(id, code);
  };

  const result = mermaidRenderQueue.then(render, render);
  mermaidRenderQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export function MermaidDiagram({
  code,
  theme,
  fallback,
}: {
  code: string;
  theme: MermaidTheme;
  fallback: ReactNode;
}) {
  const reactId = useId();
  const diagramId = `t3-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const diagramRef = useRef<HTMLDivElement>(null);
  // Remounted per code and theme via key, so the stored result always matches.
  const [result, setResult] = useState<RenderResult | null>(null);

  useEffect(() => {
    let active = true;
    void renderMermaidDiagram(diagramId, code, theme, () => active).then(
      (nextResult) => {
        if (active && nextResult) setResult(nextResult);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [code, diagramId, theme]);

  useLayoutEffect(() => {
    const svg = diagramRef.current?.querySelector("svg");
    const width = svg?.viewBox.baseVal.width ?? 0;
    if (svg && Number.isFinite(width) && width > 0) {
      svg.style.width = `${Math.ceil(width)}px`;
      svg.style.maxWidth = "none";
    }
  });

  if (!result) return fallback;

  return (
    <div
      ref={diagramRef}
      className="chat-markdown-mermaid"
      data-markdown-copy={serializeMarkdownCodeFence(code, "mermaid")}
      dangerouslySetInnerHTML={{ __html: result.svg }}
    />
  );
}
