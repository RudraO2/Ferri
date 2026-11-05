/** Switch's rule (clients/mentions.py): `@name`, case-insensitive, not followed by a name character. */
export function mentionRegex(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`@${escaped}(?![A-Za-z0-9._-])`, "i");
}
