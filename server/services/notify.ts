import { and, arrayOverlaps, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db/client.js";
import { env } from "../env.js";
import { sendEmail } from "./email.js";
import type { Role } from "../../shared/types.js";

export async function usersWithRoles(roles: Role[]) {
  const db = await getDb();
  return db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.active, true), arrayOverlaps(schema.users.roles, roles)));
}

type Notice = { type: string; title: string; link?: string; emailBody?: string };

/** In-app notification for every user, plus an email when emailBody is given. */
export async function notifyUsers(userIds: (string | null | undefined)[], n: Notice) {
  const ids = [...new Set(userIds.filter(Boolean) as string[])];
  if (!ids.length) return;
  const db = await getDb();
  const users = await db.select().from(schema.users).where(and(inArray(schema.users.id, ids), eq(schema.users.active, true)));
  if (!users.length) return;
  await db.insert(schema.notifications).values(users.map((u) => ({ userId: u.id, type: n.type, title: n.title, link: n.link })));
  if (n.emailBody) {
    for (const u of users) {
      if (u.isDemo) continue;
      await sendEmail({
        kind: "system",
        to: u.email,
        subject: n.title,
        text: `Hi ${u.name.split(" ")[0]},\n\n${n.emailBody}\n\n${n.link ? `Open: ${env.appUrl}${n.link}\n\n` : ""}York Press Hiring`,
      });
    }
  }
}

export async function notifyRoles(roles: Role[], n: Notice, extraUserIds: (string | null | undefined)[] = []) {
  const users = await usersWithRoles(roles);
  await notifyUsers([...users.map((u) => u.id), ...extraUserIds], n);
}
