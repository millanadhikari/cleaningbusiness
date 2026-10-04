import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { getConvexAuthToken } from "@/lib/convex-auth-token";
import { publicConvexOptions } from "@/lib/convex-server";

export async function requireGmailSuperAdmin() {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required.");
  const token = await getConvexAuthToken();
  if (!token) throw new Error("Authentication required.");
  const user = await fetchQuery(api.users.currentAdmin, {}, {
    ...publicConvexOptions(),
    token,
  });
  if (user.role !== "SUPER_ADMIN") throw new Error("Super Admin access required.");
  return { token };
}
