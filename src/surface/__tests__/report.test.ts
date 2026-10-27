import { expect, test } from "bun:test";
import { boxTable, byConfidence, renderReport, type ReportSurface } from "../report";

const surfaces: ReportSurface[] = [
  {
    path: "apps/api",
    stack: "ts-server",
    confidence: "medium",
    evidence: "probable + entrypoint(src/server.ts)",
    purpose: "Provides the main TypeScript HTTP API backend for the product.",
    source: "both",
  },
  {
    path: "apps/console",
    stack: "web",
    confidence: "high",
    evidence: "confirmed",
    purpose: "Delivers the authenticated web console where operators manage the product.",
    source: "both",
  },
  {
    path: "apps/marketing",
    stack: "web",
    confidence: "high",
    evidence: "confirmed",
    purpose: "Serves the public marketing site.",
    source: "both",
  },
];

test("surfaces sort high before medium, then by path", () => {
  expect(byConfidence(surfaces).map((row) => row.path)).toEqual([
    "apps/console",
    "apps/marketing",
    "apps/api",
  ]);
});

test("the report table lists high confidence above medium", () => {
  const html = renderReport({
    title: "org/repo",
    summary: "2 surfaces.",
    surfaces,
    held: [],
    diffs: [],
    convention: null,
    excluded: [],
  });
  expect(html.indexOf("apps/console")).toBeLessThan(html.indexOf("apps/api"));
  expect(html.indexOf("apps/marketing")).toBeLessThan(html.indexOf("apps/api"));
  expect(html).toContain("<table>");
  expect(html).not.toContain("<script");
});

test("a long purpose wraps inside a bordered row", () => {
  const table = boxTable(
    ["Path", "Purpose"],
    [["apps/console", "Delivers the authenticated web console where operators manage the product."]],
    [undefined, 32]
  );
  expect(table.startsWith("┌")).toBe(true);
  expect(table).toContain("│");
  expect(table).toContain("authenticated");
  const lines = table.split("\n").filter((line) => line.startsWith("│"));
  expect(lines.length).toBeGreaterThan(2);
  expect(new Set(lines.map((line) => line.length)).size).toBe(1);
});
