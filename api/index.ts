// Vercel Function: vercel.json rewrites every /api/* path here, and Hono routes on the original URL.
// (A catch-all file name only matched one path segment, so /api/auth/me returned Vercel's 404.)
import { handle } from "hono/vercel";
import app from "../server/app.js";

const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
export const OPTIONS = handler;
