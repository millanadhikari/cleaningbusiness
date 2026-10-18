import type { NextjsOptions } from "convex/nextjs";

export function publicConvexOptions(): NextjsOptions {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (url && /^http:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(url)) {
    const noProxy = new Set(
      [process.env.NO_PROXY, "127.0.0.1", "localhost"]
        .filter(Boolean)
        .flatMap((value) => value!.split(","))
        .map((value) => value.trim())
        .filter(Boolean),
    );
    process.env.NO_PROXY = Array.from(noProxy).join(",");
    process.env.no_proxy = process.env.NO_PROXY;
  }
  return { url, skipConvexDeploymentUrlCheck: true };
}
