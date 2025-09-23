import { getOwner } from "../../_lib/auth";

export async function resolveOwnerId(): Promise<string> {
  if (process.env.E2E_AUTH_BYPASS === "1") {
    return "test-owner";
  }
  try {
    const owner = await getOwner();
    return owner.ownerId;
  } catch (err: any) {
    const error = new Error("authentication required");
    (error as any).code = "E.AUTH";
    (error as any).status = 401;
    throw error;
  }
}
