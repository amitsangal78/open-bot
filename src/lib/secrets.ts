import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { AppError, dataPath } from "./core";

function key() {
  const path = dataPath("token.key");
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) {
    writeFileSync(path, randomBytes(32), { mode: 0o600 });
    chmodSync(path, 0o600);
  }
  const raw = readFileSync(path);
  if (raw.length !== 32) throw new AppError("The local token key is unusable.");
  return raw;
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, body]).toString("base64url");
}

export function decryptSecret(value: string) {
  const raw = Buffer.from(value, "base64url");
  if (raw.length < 29) throw new AppError("The stored secret could not be read.");
  const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([
    decipher.update(raw.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
