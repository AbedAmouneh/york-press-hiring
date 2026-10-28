// Two-step login (TOTP authenticator apps such as Google Authenticator, 1Password or Authy).
// Optional: REQUIRE_TWO_FACTOR=true makes it mandatory for admin and CEO accounts. Anyone who has turned
// it on is always asked for a code. Secrets are encrypted at rest; recovery codes are stored hashed.
import crypto from "node:crypto";
import { Secret, TOTP } from "otpauth";
import QRCode from "qrcode";
import { env } from "../env.js";
import type { Role } from "../../shared/types.js";

const ISSUER = "York Press Hiring";
const PERIOD = 30;
export const RECOVERY_CODE_COUNT = 8;

/** Roles that must use two-step login. */
export const TWO_FACTOR_ROLES: Role[] = ["admin", "ceo"];

type TwoFactorUser = { roles: Role[]; isDemo: boolean; totpEnabledAt: Date | null };

/** With REQUIRE_TWO_FACTOR=true, admin and CEO accounts must set it up first. Demo accounts are exempt. */
export const twoFactorRequired = (u: TwoFactorUser) => env.requireTwoFactor && !u.isDemo && u.roles.some((r) => TWO_FACTOR_ROLES.includes(r));
export const needsTwoFactorSetup = (u: TwoFactorUser) => twoFactorRequired(u) && !u.totpEnabledAt;

// ---------------------------------------------------------------- secret encryption (AES-256-GCM)

const key = () => crypto.createHash("sha256").update(`${env.sessionSecret}:totp`).digest();

export function encryptSecret(base32: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(base32, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decryptSecret(stored: string) {
  const [iv, tag, data] = stored.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

// ---------------------------------------------------------------- TOTP

const totp = (base32: string, label = "") =>
  new TOTP({ issuer: ISSUER, label, algorithm: "SHA1", digits: 6, period: PERIOD, secret: Secret.fromBase32(base32) });

/** A new secret plus what the authenticator app needs to add it. */
export async function newSetup(email: string) {
  const secret = new Secret({ size: 20 }).base32;
  const uri = totp(secret, email).toString();
  return { secret, uri, qrDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
}

/**
 * Check a 6-digit code, allowing one step of clock drift. Returns the time step it matched so the
 * caller can refuse the same code twice, or null when it doesn't match (or was already used).
 */
export function checkCode(base32: string, code: string, lastStep: number | null, now = Date.now()): number | null {
  const token = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(token)) return null;
  const delta = totp(base32).validate({ token, window: 1, timestamp: now });
  if (delta === null) return null;
  const step = Math.floor(now / 1000 / PERIOD) + delta;
  return lastStep !== null && step <= lastStep ? null : step;
}

/** For tests and the smoke script: the current code for a secret. */
export const currentCode = (base32: string, now = Date.now()) => totp(base32).generate({ timestamp: now });

// ---------------------------------------------------------------- recovery codes

const hashCode = (code: string) => crypto.createHash("sha256").update(code.replace(/[\s-]/g, "").toLowerCase()).digest("hex");

/** Codes to show the user once ("abcd-efgh-ijkl") and their hashes to store. */
export function newRecoveryCodes() {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
    crypto.randomBytes(9).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "x").slice(0, 12).match(/.{4}/g)!.join("-"));
  return { codes, hashes: codes.map(hashCode) };
}

/** Returns the remaining hashes if the code matched one (it can't be used again), else null. */
export function redeemRecoveryCode(hashes: string[], code: string): string[] | null {
  const h = hashCode(code);
  return hashes.includes(h) ? hashes.filter((x) => x !== h) : null;
}

// ---------------------------------------------------------------- sign-in challenge

const CHALLENGE_MINUTES = 5;
const sign = (payload: string) => crypto.createHmac("sha256", env.sessionSecret).update(`mfa:${payload}`).digest("base64url");

/** After a correct password: a short-lived, signed proof that step one passed for this user. */
export function createChallenge(userId: string, now = Date.now()) {
  const payload = `${userId}.${now + CHALLENGE_MINUTES * 60_000}`;
  return `${payload}.${sign(payload)}`;
}

export function readChallenge(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const [userId, expires, sig] = token.split(".");
  if (!userId || !expires || !sig) return null;
  const expected = sign(`${userId}.${expires}`);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return Number(expires) > now ? userId : null;
}
