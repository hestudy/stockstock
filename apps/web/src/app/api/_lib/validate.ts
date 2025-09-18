export function isValidBacktestId(id: string): boolean {
  if (!id || typeof id !== "string") return false;
  // Accept UUID v4-like or simple safe slug (alnum, dash, underscore, 3-64 chars)
  const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const safeSlug = /^[A-Za-z0-9-_]{3,64}$/;
  return uuidV4.test(id) || safeSlug.test(id);
}
