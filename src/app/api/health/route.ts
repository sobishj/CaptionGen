import { readModels } from "@/lib/admin/models";
import { publicModels } from "@/lib/model-selection";
import { getConfig, getStore } from "@/lib/server-env";

export const dynamic = "force-dynamic";

export async function GET() {
  let models = 0;
  let storage = "unknown";
  let ok = true;
  try {
    const store = getStore();
    storage = store.kind;
    models = publicModels(await readModels(store), getConfig().llm).length;
  } catch {
    ok = false;
  }
  return Response.json(
    { status: ok ? "ok" : "degraded", modelsAvailable: models, storage, time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
