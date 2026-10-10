const CODE_RE = /^[23456789abcdefghjkmnpqrstuvwxyz]{10}$/;

/** Accepts a bare code or any link ending in `/join/<code>` (hash routes included). */
export function parseInviteCode(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  const fromLink = /\/join\/([a-z0-9]+)\/?$/.exec(trimmed)?.[1];
  const code = fromLink ?? trimmed;
  return CODE_RE.test(code) ? code : null;
}

export function inviteLink(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/#/join/${code}`;
}
