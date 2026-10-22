import { createHash, timingSafeEqual } from "node:crypto";

// 장비 토큰 — DB 에는 sha256(hex) 만 둔다(scripts/ops2-token.mjs 가 만든다).
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Authorization: Bearer <토큰> 이 그 장비의 해시와 같은지. 자리표시·형식이 다른 해시는 늘 거짓. */
export function tokenMatches(authHeader: string | null, tokenHash: string): boolean {
  const m = /^Bearer (.+)$/.exec(authHeader ?? "");
  if (!m || !/^[0-9a-f]{64}$/.test(tokenHash)) return false;
  const got = Buffer.from(hashToken(m[1]), "hex");
  const want = Buffer.from(tokenHash, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}
