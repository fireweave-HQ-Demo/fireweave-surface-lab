import { describe, expect, test } from "bun:test";
import { parseGitLink } from "./cli";
import { loadCatalog, pickRepos, runnableRepos } from "./suite";

describe("suite catalog", () => {
  test("every runnable url can be checked out, and the short run names real ids", async () => {
    const catalog = await loadCatalog();
    const ids = catalog.repos.map((repo) => repo.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of catalog.runOrder) expect(ids).toContain(id);
    for (const repo of runnableRepos(catalog)) {
      expect(parseGitLink(repo.url)).not.toBeNull();
    }
    const org = catalog.repos.find((repo) => repo.id === "pages-themes");
    expect(org?.runnable).toBe(false);
    expect(parseGitLink(org?.url ?? "")).toBeNull();
  });

  test("order, tier, and id pick from the list", async () => {
    const catalog = await loadCatalog();
    expect(pickRepos(catalog, "order").map((repo) => repo.id)).toEqual(catalog.runOrder);
    expect(pickRepos(catalog, "tier:1").map((repo) => repo.id).sort()).toEqual(["fastapi", "hono"]);
    expect(pickRepos(catalog, "hono")).toEqual([catalog.repos.find((repo) => repo.id === "hono")]);
    expect(pickRepos(catalog, "https://github.com/nvm-sh/nvm")[0]?.id).toBe("nvm");
    expect(() => pickRepos(catalog, "nope")).toThrow("no catalog entry");
  });
});
