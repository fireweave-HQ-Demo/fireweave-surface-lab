import { eq } from "drizzle-orm";
import { member } from "@clinic/db";
import { auth } from "./auth";
import { db } from "./db";

export type Staff = { userId: string; clinicId: string; role: string };

export async function staff(c: { req: { raw: Request } }): Promise<Staff | null> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return null;
  const [membership] = await db.select().from(member).where(eq(member.userId, session.user.id));
  if (!membership) return null;
  return { userId: session.user.id, clinicId: membership.organizationId, role: membership.role };
}
