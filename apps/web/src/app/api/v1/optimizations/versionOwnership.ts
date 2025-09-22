import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const STORE_KEY = Symbol.for("opt.version.store");
const CLIENT_KEY = Symbol.for("opt.version.client");

type VersionStore = Map<string, string>;

type GlobalWithStore = typeof globalThis & {
  [STORE_KEY]?: VersionStore;
  [CLIENT_KEY]?: SupabaseClient;
};

function getStore(): VersionStore {
  const globalObj = globalThis as GlobalWithStore;
  if (!globalObj[STORE_KEY]) {
    globalObj[STORE_KEY] = new Map();
  }
  return globalObj[STORE_KEY]!;
}

function getClient(): SupabaseClient {
  const globalObj = globalThis as GlobalWithStore;
  if (globalObj[CLIENT_KEY]) {
    return globalObj[CLIENT_KEY]!;
  }
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    const error = new Error("Supabase service credentials are missing");
    (error as any).code = "E.CONFIG";
    (error as any).status = 500;
    throw error;
  }
  const client = createClient(url, serviceKey, { auth: { persistSession: false } });
  globalObj[CLIENT_KEY] = client;
  return client;
}

export async function assertVersionOwnership(ownerId: string, versionId: string) {
  if (!versionId) {
    const error = new Error("versionId is required");
    (error as any).code = "E.PARAM_INVALID";
    (error as any).status = 400;
    throw error;
  }
  const store = getStore();
  const seededOwner = store.get(versionId);
  if (seededOwner) {
    if (seededOwner !== ownerId) {
      throwForbidden(versionId);
    }
    return;
  }
  const client = getClient();
  const { data, error } = await client
    .from("strategy_versions")
    .select("id, owner_id")
    .eq("id", versionId)
    .single();
  if (error) {
    if ((error as any).code === "PGRST116") {
      throwNotFound(versionId);
    }
    const err = new Error("failed to verify strategy version ownership");
    (err as any).code = "E.DEP_UPSTREAM";
    (err as any).status = 502;
    (err as any).details = error;
    throw err;
  }
  if (!data) {
    throwNotFound(versionId);
  }
  if (data.owner_id !== ownerId) {
    throwForbidden(versionId);
  }
}

export function seedVersionOwnership(versionId: string, ownerId: string) {
  const store = getStore();
  store.set(versionId, ownerId);
}

export function resetVersionOwnershipStore() {
  const globalObj = globalThis as GlobalWithStore;
  const store = globalObj[STORE_KEY];
  if (store) {
    store.clear();
  }
}

function throwForbidden(versionId: string): never {
  const error = new Error("version does not belong to current owner");
  (error as any).code = "E.FORBIDDEN";
  (error as any).status = 403;
  (error as any).details = { versionId };
  throw error;
}

function throwNotFound(versionId: string): never {
  const error = new Error("strategy version not found");
  (error as any).code = "E.NOT_FOUND";
  (error as any).status = 404;
  (error as any).details = { versionId };
  throw error;
}
