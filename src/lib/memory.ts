import {
  mkdirSync,
  readFileSync,
  readdirSync,
  existsSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { dataPath, AppError } from "./core";

export function memory() {
  mkdirSync(dataPath("memory"), { recursive: true, mode: 0o700 });
  for (const name of ["USER.md", "MEMORY.md"])
    if (!existsSync(dataPath("memory", name)))
      writeFileSync(
        dataPath("memory", name),
        name === "USER.md" ? "# User\n" : "# Assistant memory\n",
        { mode: 0o600, flag: "wx" },
      );
  return {
    user: readFileSync(dataPath("memory", "USER.md"), "utf8"),
    notes: readFileSync(dataPath("memory", "MEMORY.md"), "utf8"),
  };
}
export function saveMemory(user: string, notes: string) {
  memory();
  if (user.length + notes.length > 16000)
    throw new AppError("Memory is limited to 16,000 characters.");
  for (const [name, value] of [
    ["USER.md", user],
    ["MEMORY.md", notes],
  ]) {
    const tmp = dataPath("memory", `${name}.${randomUUID()}.tmp`);
    writeFileSync(tmp, value, { mode: 0o600 });
    renameSync(tmp, dataPath("memory", name));
  }
}
export function skills() {
  const root = resolve("skills");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.isSymbolicLink())
    .flatMap((d) => {
      const file = resolve(root, d.name, "SKILL.md");
      return existsSync(file)
        ? [
            {
              name: d.name,
              content: readFileSync(file, "utf8").slice(0, 12000),
            },
          ]
        : [];
    });
}
