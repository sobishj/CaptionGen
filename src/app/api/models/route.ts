import { readModels } from "@/lib/admin/models";
import { publicModels } from "@/lib/model-selection";
import { getConfig, getStore } from "@/lib/server-env";

export const dynamic = "force-dynamic";

/** Models users can choose from. No provider details or keys. */
export async function GET() {
  try {
    const models = publicModels(await readModels(getStore()), getConfig().llm);
    return Response.json({ models }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[models]", err);
    return Response.json({ models: [] }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
