// Shapes the screens work with, taken from the API's own response types so they can't drift.
import type { InferResponseType } from "hono/client";
import type { rpc } from "./rpc";

type Ok<T extends (...args: never[]) => unknown> = InferResponseType<T, 200>;

export type Me = NonNullable<Ok<typeof rpc.auth.me.$get>["user"]>;
export type RequestRow = Ok<(typeof rpc.requests)[":id"]["$get"]>["request"];
export type RequestEvent = Ok<(typeof rpc.requests)[":id"]["$get"]>["events"][number];
export type CandidateRow = Ok<(typeof rpc.requests)[":id"]["candidates"]["$get"]>["candidates"][number];
export type CandidateDetail = Ok<(typeof rpc)["role-candidates"][":id"]["$get"]>;
export type Run = Ok<(typeof rpc.requests)[":id"]["runs"]["$get"]>["runs"][number];
export type Application = Ok<(typeof rpc.requests)[":id"]["applications"]["$get"]>["applications"][number];
export type OutreachData = Ok<typeof rpc.outreach.$get>;
export type OutreachMessage = OutreachData["messages"][number];
export type SettingsData = Ok<typeof rpc.settings.$get>;
export type Template = Ok<typeof rpc.templates.$get>["templates"][number];
export type UserRow = Ok<typeof rpc.users.$get>["users"][number];
export type Notification = Ok<typeof rpc.notifications.$get>["notifications"][number];
export type OutboxEmail = Ok<typeof rpc.outbox.$get>["emails"][number];
export type Position = Ok<typeof rpc.positions.$get>["positions"][number];
