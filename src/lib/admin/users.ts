import { hmac } from "../auth";
import type { JsonStore } from "../storage";
import type { AdminUserView } from "./schemas";

/**
 * Admin accounts. The owner account comes from ADMIN_EMAIL / ADMIN_PASSWORD
 * (always available, so you can't lock yourself out); further admins are
 * stored and managed in the admin panel.
 */
export interface AdminUserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  /** Bumped on password change to sign out existing sessions. */
  sessionVersion: number;
  createdAt: number;
  lastLoginAt: number | null;
}

export const OWNER_ID = "owner";
const KEY = "users";

export async function readUsers(store: JsonStore): Promise<AdminUserRecord[]> {
  return (await store.get<AdminUserRecord[]>(KEY)) ?? [];
}

export async function writeUsers(store: JsonStore, users: AdminUserRecord[]): Promise<void> {
  await store.put(KEY, users);
}

/** Changes whenever ADMIN_PASSWORD changes, which signs the owner out everywhere. */
export async function ownerSessionVersion(password: string): Promise<string> {
  return (await hmac("owner-session-version", password)).slice(0, 16);
}

export function ownerView(email: string): AdminUserView {
  return { id: OWNER_ID, name: "Owner", email, owner: true, lastLoginAt: null, createdAt: null };
}

export function toUserView(u: AdminUserRecord): AdminUserView {
  return { id: u.id, name: u.name, email: u.email, owner: false, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt };
}
