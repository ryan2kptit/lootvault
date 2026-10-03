import { existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Set KEY=value pairs in a dotenv file, replacing existing keys in place and
 * appending new ones. Comments and unrelated lines are preserved.
 * @param {URL} fileUrl
 * @param {Record<string, string>} values
 */
export function upsertEnv(fileUrl, values) {
  const lines = existsSync(fileUrl) ? readFileSync(fileUrl, "utf8").replace(/\n+$/, "").split("\n") : [];
  if (lines.length === 1 && lines[0] === "") lines.pop();
  for (const [key, value] of Object.entries(values)) {
    const index = lines.findIndex((line) => line.startsWith(`${key}=`));
    if (index >= 0) lines[index] = `${key}=${value}`;
    else lines.push(`${key}=${value}`);
  }
  writeFileSync(fileUrl, `${lines.join("\n")}\n`);
}
