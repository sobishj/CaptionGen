import { z } from "zod";
import {
  clearSessionCookie,
  createSessionToken,
  hmac,
  isSameOrigin,
  isSecureRequest,
  readCookie,
  safeEqual,
  sessionCookie,
  verifySessionToken,
} from "../auth";
import { generateCaptions } from "../caption-service";
import type { AppConfig, LlmTarget } from "../config";
import { AppError } from "../errors";
import { errorResponse, toAppError } from "../generate-handler";
import { createProvider } from "../llm";
import { listModels } from "../llm/catalog";
import type { FetchLike } from "../llm/types";
import { hashPassword, passwordProblem, verifyPassword } from "../passwords";
import { clientIp, type RateLimiter } from "../rate-limit";
import type { GenerateRequest } from "../schemas";
import type { JsonStore } from "../storage";
import {
  buildRecord,
  ordered,
  readModels,
  targetFromInput,
  toAdminModel,
  toTarget,
  writeModels,
  type ModelsDoc,
} from "./models";
import {
  ModelInputSchema,
  UserInputSchema,
  type AdminUserView,
  type DiscoverResult,
  type ModelsListing,
  type SessionInfo,
  type TestResult,
} from "./schemas";
import { OWNER_ID, ownerSessionVersion, ownerView, readUsers, toUserView, writeUsers, type AdminUserRecord } from "./users";

export interface AdminHandlerDeps {
  getConfig: () => AppConfig;
  getStore: () => JsonStore;
  runtime: "cloudflare" | "node";
  /** Login attempts per IP (5 per 15 minutes). */
  loginLimiter: RateLimiter;
  fetch?: FetchLike;
  /** Delay after a wrong password, to slow down guessing. */
  failDelayMs?: number;
}

const SAMPLE: GenerateRequest = {
  description: "Handmade soy candles, lavender scent, launching this Friday",
  platform: "instagram",
  tone: "friendly",
  count: 1,
  emojis: true,
};

const json = (data: unknown, init: ResponseInit = {}) =>
  Response.json(data, { ...init, headers: { "cache-control": "no-store", ...init.headers } });

async function readBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError("INVALID_INPUT", "Invalid request body.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new AppError("INVALID_INPUT", parsed.error.issues[0]?.message);
  return parsed.data;
}

const LoginSchema = z.object({ email: z.string().trim().toLowerCase().max(320), password: z.string().max(200) });
const PasswordSchema = z.object({ currentPassword: z.string().max(200), newPassword: z.string().max(200) });
const PrioritySchema = z.object({ modelIds: z.array(z.string()).min(1, "Keep at least one model in the list.") });
const TestSchema = z.object({ modelId: z.string().nullish(), config: z.unknown() });

function notFound(what: string): never {
  throw new AppError("INVALID_INPUT", `${what} not found.`);
}

/** Admin API under /api/admin/*, on standard Request/Response. */
export function createAdminHandler(deps: AdminHandlerDeps) {
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  function secretOf(config: AppConfig): string | undefined {
    return config.admin.sessionSecret || config.admin.password;
  }

  async function currentUser(req: Request, config: AppConfig): Promise<AdminUserView | null> {
    const secret = secretOf(config);
    if (!secret) return null;
    const claims = await verifySessionToken(secret, readCookie(req));
    if (!claims) return null;
    if (claims.uid === OWNER_ID) {
      if (!config.admin.password) return null;
      return claims.ver === (await ownerSessionVersion(config.admin.password)) ? ownerView(config.admin.email) : null;
    }
    const user = (await readUsers(deps.getStore())).find((u) => u.id === claims.uid);
    return user && String(user.sessionVersion) === claims.ver ? toUserView(user) : null;
  }

  async function listing(config: AppConfig, doc?: ModelsDoc): Promise<ModelsListing> {
    const d = doc ?? (await readModels(deps.getStore()));
    return {
      models: ordered(d).map((m) => toAdminModel(m, d)),
      priority: d.priority,
      builtin: config.llm ? { label: config.llm.modelLabel, model: config.llm.model } : null,
    };
  }

  async function usersListing(config: AppConfig): Promise<AdminUserView[]> {
    const stored = (await readUsers(deps.getStore())).map(toUserView);
    return config.admin.password ? [ownerView(config.admin.email), ...stored] : stored;
  }

  async function runTest(target: LlmTarget): Promise<TestResult> {
    const started = Date.now();
    try {
      const r = await generateCaptions(SAMPLE, { provider: createProvider(target, deps.fetch), llm: target });
      const v = r.variations[0]!;
      return { ok: true, ms: Date.now() - started, reply: `${v.caption}\n\n${v.hashtags.join(" ")}`.trim() };
    } catch (err) {
      const e = toAppError(err);
      const error =
        e.code === "BAD_OUTPUT"
          ? "The model answered, but not in the JSON format CaptionGen needs. Try switching JSON mode on (if the server supports it) or a larger model."
          : (e.detail ?? e.message);
      return { ok: false, ms: Date.now() - started, error };
    }
  }

  async function modelFromForm(body: z.infer<typeof TestSchema>, config: AppConfig) {
    const doc = await readModels(deps.getStore());
    const existing = body.modelId ? (doc.models.find((m) => m.id === body.modelId) ?? notFound("Model")) : null;
    const parsed = ModelInputSchema.safeParse(body.config);
    if (!parsed.success) throw new AppError("INVALID_INPUT", parsed.error.issues[0]?.message);
    return targetFromInput(parsed.data, existing, config.admin.encryptionKey);
  }

  async function route(req: Request, path: string[], config: AppConfig): Promise<Response> {
    const store = deps.getStore();
    const method = req.method;
    const [a, b, c] = path;

    // ---- public auth endpoints
    if (a === "auth" && b === "me" && method === "GET") {
      const info: SessionInfo = {
        user: await currentUser(req, config),
        configured: Boolean(secretOf(config)),
        encryption: Boolean(config.admin.encryptionKey),
        storage: store.kind,
        runtime: deps.runtime,
      };
      return json(info);
    }

    if (a === "auth" && b === "login" && method === "POST") {
      if (!isSameOrigin(req)) return json({ error: { code: "INVALID_INPUT", message: "Bad origin." } }, { status: 403 });
      const secret = secretOf(config);
      if (!secret) throw new AppError("NOT_CONFIGURED", "ADMIN_PASSWORD isn't set on the server yet.");
      if (!deps.loginLimiter.check(clientIp(req))) {
        throw new AppError("RATE_LIMITED", "Too many sign-in attempts. Try again in 15 minutes.");
      }
      const { email, password } = await readBody(req, LoginSchema);

      let claims: { uid: string; ver: string } | null = null;
      let user: AdminUserView | null = null;
      if (config.admin.password && email === config.admin.email) {
        const k = "password-check";
        if (safeEqual(await hmac(k, password), await hmac(k, config.admin.password))) {
          claims = { uid: OWNER_ID, ver: await ownerSessionVersion(config.admin.password) };
          user = ownerView(config.admin.email);
        }
      } else {
        const users = await readUsers(store);
        const found = users.find((u) => u.email === email);
        if (found && (await verifyPassword(found.passwordHash, password))) {
          found.lastLoginAt = Date.now();
          await writeUsers(store, users);
          claims = { uid: found.id, ver: String(found.sessionVersion) };
          user = toUserView(found);
        }
      }

      if (!claims) {
        await delay(deps.failDelayMs ?? 800);
        return json({ error: { code: "INVALID_INPUT", message: "Incorrect email or password." } }, { status: 401 });
      }
      const token = await createSessionToken(secret, claims);
      return json({ user }, { headers: { "set-cookie": sessionCookie(token, isSecureRequest(req)) } });
    }

    if (a === "auth" && b === "logout" && method === "POST") {
      return json({ ok: true }, { headers: { "set-cookie": clearSessionCookie(isSecureRequest(req)) } });
    }

    // ---- everything below needs a signed-in admin
    const me = await currentUser(req, config);
    if (!me) return json({ error: { code: "INVALID_INPUT", message: "Please sign in." } }, { status: 401 });
    if (method !== "GET" && !isSameOrigin(req)) {
      return json({ error: { code: "INVALID_INPUT", message: "Bad origin." } }, { status: 403 });
    }

    if (a === "auth" && b === "password" && method === "POST") {
      if (me.owner) {
        throw new AppError(
          "INVALID_INPUT",
          "The owner password is the ADMIN_PASSWORD secret on the server. Change that secret to change it.",
        );
      }
      const body = await readBody(req, PasswordSchema);
      const users = await readUsers(store);
      const u = users.find((x) => x.id === me.id) ?? notFound("User");
      if (!(await verifyPassword(u.passwordHash, body.currentPassword))) {
        throw new AppError("INVALID_INPUT", "Current password is incorrect.");
      }
      const problem = passwordProblem(body.newPassword);
      if (problem) throw new AppError("INVALID_INPUT", problem);
      u.passwordHash = await hashPassword(body.newPassword);
      u.sessionVersion++;
      await writeUsers(store, users);
      const token = await createSessionToken(secretOf(config)!, { uid: u.id, ver: String(u.sessionVersion) });
      return json({ ok: true }, { headers: { "set-cookie": sessionCookie(token, isSecureRequest(req)) } });
    }

    // ---- AI models
    if (a === "models") {
      if (!b && method === "GET") return json(await listing(config));

      if (!b && method === "POST") {
        const input = await readBody(req, ModelInputSchema);
        const doc = await readModels(store);
        const rec = await buildRecord(input, null, config.admin.encryptionKey);
        doc.models.push(rec);
        doc.priority.push(rec.id);
        await writeModels(store, doc);
        return json(await listing(config, doc), { status: 201 });
      }

      if (b === "priority" && method === "PUT") {
        const { modelIds } = await readBody(req, PrioritySchema);
        const doc = await readModels(store);
        for (const id of modelIds) if (!doc.models.some((m) => m.id === id)) notFound("Model");
        doc.priority = [...new Set([...modelIds, ...doc.priority])];
        await writeModels(store, doc);
        return json(await listing(config, doc));
      }

      if (b === "test" && method === "POST") {
        return json(await runTest(await modelFromForm(await readBody(req, TestSchema), config)));
      }

      if (b === "discover" && method === "POST") {
        const target = await modelFromForm(await readBody(req, TestSchema), config);
        const r = await listModels(target, { fetch: deps.fetch });
        const out: DiscoverResult = r.ok ? { ok: true, models: r.models } : { ok: false, error: r.error };
        return json(out);
      }

      if (b) {
        const doc = await readModels(store);
        const idx = doc.models.findIndex((m) => m.id === b);
        if (idx === -1) notFound("Model");
        const existing = doc.models[idx]!;

        if (!c && method === "PUT") {
          const input = await readBody(req, ModelInputSchema);
          doc.models[idx] = await buildRecord(input, existing, config.admin.encryptionKey);
          await writeModels(store, doc);
          return json(await listing(config, doc));
        }

        if (!c && method === "DELETE") {
          doc.models.splice(idx, 1);
          doc.priority = doc.priority.filter((id) => id !== b);
          await writeModels(store, doc);
          return json(await listing(config, doc));
        }

        if (c === "test" && method === "POST") {
          const result = await runTest(await toTarget(existing, config.admin.encryptionKey));
          existing.lastTest = {
            ok: result.ok,
            at: Date.now(),
            ms: result.ms,
            message: (result.ok ? result.reply : result.error)?.slice(0, 300) ?? "",
          };
          await writeModels(store, doc);
          return json({ result, listing: await listing(config, doc) });
        }

        if (c === "default" && method === "POST") {
          existing.enabled = true;
          doc.priority = [b, ...doc.priority.filter((id) => id !== b)];
          await writeModels(store, doc);
          return json(await listing(config, doc));
        }
      }
    }

    // ---- admin users
    if (a === "users") {
      if (!b && method === "GET") return json({ users: await usersListing(config), me: me.id });

      if (!b && method === "POST") {
        const input = await readBody(req, UserInputSchema);
        const problem = passwordProblem(input.password);
        if (problem) throw new AppError("INVALID_INPUT", problem);
        const users = await readUsers(store);
        if (input.email === config.admin.email || users.some((u) => u.email === input.email)) {
          throw new AppError("INVALID_INPUT", "An admin with this email already exists.");
        }
        const user: AdminUserRecord = {
          id: crypto.randomUUID(),
          name: input.name,
          email: input.email,
          passwordHash: await hashPassword(input.password),
          sessionVersion: 1,
          createdAt: Date.now(),
          lastLoginAt: null,
        };
        users.push(user);
        await writeUsers(store, users);
        return json({ users: await usersListing(config), me: me.id }, { status: 201 });
      }

      if (b) {
        if (b === OWNER_ID) {
          throw new AppError("INVALID_INPUT", "The owner account is set with the ADMIN_EMAIL and ADMIN_PASSWORD secrets.");
        }
        const users = await readUsers(store);
        const u = users.find((x) => x.id === b) ?? notFound("User");

        if (method === "PUT") {
          const input = await readBody(req, UserInputSchema);
          if (
            input.email !== u.email &&
            (input.email === config.admin.email || users.some((x) => x.email === input.email))
          ) {
            throw new AppError("INVALID_INPUT", "An admin with this email already exists.");
          }
          u.name = input.name;
          u.email = input.email;
          if (input.password) {
            const problem = passwordProblem(input.password);
            if (problem) throw new AppError("INVALID_INPUT", problem);
            u.passwordHash = await hashPassword(input.password);
            u.sessionVersion++;
          }
          await writeUsers(store, users);
          return json({ users: await usersListing(config), me: me.id });
        }

        if (method === "DELETE") {
          if (u.id === me.id) throw new AppError("INVALID_INPUT", "You can't remove your own account.");
          await writeUsers(
            store,
            users.filter((x) => x.id !== u.id),
          );
          return json({ users: await usersListing(config), me: me.id });
        }
      }
    }

    return json({ error: { code: "INVALID_INPUT", message: "Not found." } }, { status: 404 });
  }

  return async function handle(req: Request, path: string[]): Promise<Response> {
    try {
      return await route(req, path, deps.getConfig());
    } catch (err) {
      const e = toAppError(err);
      if (e.code === "INTERNAL") console.error(`[admin] ${e.detail ?? e.message}`);
      return errorResponse(e);
    }
  };
}
