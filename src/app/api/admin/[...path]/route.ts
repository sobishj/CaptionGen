import { createAdminHandler } from "@/lib/admin/handler";
import { getConfig, getRuntime, getStore, loginLimiter } from "@/lib/server-env";

export const dynamic = "force-dynamic";

const handler = createAdminHandler({
  getConfig,
  getStore,
  runtime: getRuntime(),
  loginLimiter,
});

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: Request, ctx: Ctx) {
  return handler(req, (await ctx.params).path);
}

export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
