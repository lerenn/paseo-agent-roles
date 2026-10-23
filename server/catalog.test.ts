import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deleteUserRole, listRoles, saveUserRole } from "./catalog";

const tmp = () => mkdtemp(path.join(tmpdir(), "catalog-"));

describe("role catalog", () => {
  it("lists bundled roles when nothing else exists", async () => {
    const roles = await listRoles(undefined, { user: await tmp() });
    expect(roles.map((r) => r.name)).toEqual(["babysitter", "implementer", "investigator", "qa", "reviewer"]);
    expect(roles.every((r) => r.source === "bundled" && r.role)).toBe(true);
  });

  it("reports the winning source and what it overrides", async () => {
    const user = await tmp();
    const project = await tmp();
    await mkdir(path.join(project, ".paseo", "roles"), { recursive: true });
    await writeFile(path.join(project, ".paseo", "roles", "qa.yaml"), "name: qa\nmodel: p\n");
    await writeFile(path.join(user, "qa.yaml"), "name: qa\nmodel: u\n");
    await writeFile(path.join(user, "mine.yaml"), "name: mine\n");
    const roles = await listRoles(project, { user });
    const qa = roles.find((r) => r.name === "qa");
    expect(qa).toMatchObject({ source: "project", overrides: ["user", "bundled"] });
    expect(qa?.role?.model).toBe("p");
    expect(roles.find((r) => r.name === "mine")?.source).toBe("user");
  });

  it("surfaces invalid files instead of hiding them", async () => {
    const user = await tmp();
    await writeFile(path.join(user, "bad.yaml"), "name: bad\nnope: 1\n");
    await writeFile(path.join(user, "Not Valid.yaml"), "name: x\n");
    const roles = await listRoles(undefined, { user });
    expect(roles.find((r) => r.name === "bad")).toMatchObject({ source: "user" });
    expect(roles.find((r) => r.name === "bad")?.error).toMatch(/nope|Unrecognized/);
    expect(roles.some((r) => r.name === "Not Valid")).toBe(false);
  });

  it("saves, replaces and deletes user roles", async () => {
    const user = await tmp();
    await writeFile(path.join(user, "r.json"), JSON.stringify({ name: "r", model: "old" }));
    const { file } = await saveUserRole("name: r\nmodel: new", { user });
    expect(file).toBe(path.join(user, "r.yaml"));
    expect(await readdir(user)).toEqual(["r.yaml"]);
    expect(await readFile(file, "utf8")).toBe("name: r\nmodel: new\n");
    await deleteUserRole("r", { user });
    expect(await readdir(user)).toEqual([]);
  });

  it("rejects invalid role text with a readable message", async () => {
    const user = await tmp();
    await expect(saveUserRole("name: Bad Name", { user })).rejects.toThrow(/name: /);
    await expect(deleteUserRole("../x", { user })).rejects.toThrow();
    expect(await readdir(user)).toEqual([]);
  });
});
