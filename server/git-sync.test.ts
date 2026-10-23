import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listRoles } from "./catalog";
import { GitSources, redactUrl, sourceLabel } from "./git-sync";

const tmp = () => mkdtemp(path.join(tmpdir(), "gitsync-"));
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, stdio: "pipe" });

/** A local origin repository with roles/ev.yaml committed on branch main. */
async function makeOrigin(model = "v1") {
  const repo = await tmp();
  git(repo, "init", "-q", "-b", "main");
  await mkdir(path.join(repo, "roles"));
  await writeFile(path.join(repo, "roles", "ev.yaml"), `name: ev\nmodel: ${model}\n`);
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "init");
  return repo;
}
const commit = (repo: string, model: string) =>
  writeFile(path.join(repo, "roles", "ev.yaml"), `name: ev\nmodel: ${model}\n`).then(() => {
    git(repo, "commit", "-qam", model);
  });

describe("GitSources", () => {
  it("clones, then fetches updates, into the cache dir", async () => {
    const origin = await makeOrigin();
    const sources = new GitSources(await tmp());
    const source = { url: origin, ref: "main", path: "roles", intervalMinutes: 5 };
    const first = await sources.sync(source);
    expect(first).toMatchObject({ error: null, syncing: false });
    expect(first.lastSync).toMatch(/^\d{4}-/);
    expect(await readFile(path.join(sources.rolesDir(source), "ev.yaml"), "utf8")).toContain("v1");

    await commit(origin, "v2");
    await sources.sync(source);
    expect(await readFile(path.join(sources.rolesDir(source), "ev.yaml"), "utf8")).toContain("v2");
  });

  it("keeps the last good copy and reports the error when a sync fails", async () => {
    const origin = await makeOrigin();
    const sources = new GitSources(await tmp());
    const source = { url: origin, ref: "main", path: "roles", intervalMinutes: 5 };
    const ok = await sources.sync(source);
    git(origin, "branch", "-m", "main", "renamed");
    const failed = await sources.sync(source);
    expect(failed.error).toBeTruthy();
    expect(failed.lastSync).toBe(ok.lastSync);
    expect(existsSync(path.join(sources.rolesDir(source), "ev.yaml"))).toBe(true);
  });

  it("reports a failed first clone and leaves no half-written cache", async () => {
    const root = await tmp();
    const sources = new GitSources(root);
    const source = { url: path.join(root, "nope"), intervalMinutes: 5 };
    const status = await sources.sync(source);
    expect(status).toMatchObject({ lastSync: null, syncing: false });
    expect(status.error).toBeTruthy();
    expect(existsSync(sources.cacheDir(source))).toBe(false);
  });

  it("refuses option-like urls and refs without running git", async () => {
    const calls: string[][] = [];
    const sources = new GitSources(await tmp(), async (args) => void calls.push(args));
    expect((await sources.sync({ url: "--upload-pack=x", intervalMinutes: 5 })).error).toBeTruthy();
    expect((await sources.sync({ url: "u", ref: "--x", intervalMinutes: 5 })).error).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it("shares one run between concurrent syncs of a source", async () => {
    let clones = 0;
    const sources = new GitSources(await tmp(), async (args) => {
      if (args[0] === "clone") {
        clones++;
        await mkdir(path.join(args[args.length - 1], ".git"), { recursive: true });
      }
    });
    const source = { url: "u", intervalMinutes: 5 };
    await Promise.all([sources.sync(source), sources.sync(source)]);
    expect(clones).toBe(1);
  });

  it("feeds the role catalog as a git layer below user roles", async () => {
    const origin = await makeOrigin();
    const sources = new GitSources(await tmp());
    const source = { url: origin, ref: "main", path: "roles", intervalMinutes: 5 };
    await sources.sync(source);
    const user = await tmp();
    await writeFile(path.join(user, "qa.yaml"), "name: qa\n");
    const git2 = { label: sourceLabel(source), dir: sources.rolesDir(source) };
    const roles = await listRoles(undefined, { user, git: [git2] });
    expect(roles.find((r) => r.name === "ev")).toMatchObject({ source: "git", origin: `git: ${origin}@main` });
    expect(roles.find((r) => r.name === "qa")?.source).toBe("user");
    expect(roles.map((r) => r.name).sort()).toEqual(["ev", "qa"]);
  });
});

describe("labels", () => {
  it("never shows credentials", () => {
    expect(redactUrl("https://user:tok@github.com/a/b.git")).toBe("https://github.com/a/b.git");
    expect(sourceLabel({ url: "https://u:p@h/r.git", ref: "v1" })).toBe("git: https://h/r.git@v1");
    expect(sourceLabel({ url: "git@github.com:a/b.git" })).toBe("git: git@github.com:a/b.git@HEAD");
  });
});
