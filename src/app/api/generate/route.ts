import { readModels } from "@/lib/admin/models";
import { createGenerateHandler } from "@/lib/generate-handler";
import { createProvider } from "@/lib/llm";
import { resolveTargets } from "@/lib/model-selection";
import { getConfig, getGenerateLimiter, getStore } from "@/lib/server-env";

export const dynamic = "force-dynamic";

const handler = createGenerateHandler({
  resolveTargets: async (modelId) => {
    const config = getConfig();
    return resolveTargets(await readModels(getStore()), modelId, config.llm, config.admin.encryptionKey);
  },
  getProvider: (target) => createProvider(target),
  getRateLimiter: () => getGenerateLimiter(getConfig().rateLimitPerMinute),
});

export function POST(req: Request) {
  return handler(req);
}
