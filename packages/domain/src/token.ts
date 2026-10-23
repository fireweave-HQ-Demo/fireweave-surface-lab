import { createHmac, timingSafeEqual } from "node:crypto";

export type TokenPayload = {
  referralId: string;
  clinicId: string;
  exp: number;
};

export function mintApprovalToken(payload: TokenPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readApprovalToken(token: string, secret: string): TokenPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as TokenPayload;
  if (payload.exp < Date.now()) return null;
  return payload;
}
