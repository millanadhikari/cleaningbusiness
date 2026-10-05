const STORAGE_KEY = "wdc_analytics_session";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

function isUuid(value: string | null) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
  );
}

export function getWebsiteSessionId() {
  if (typeof window === "undefined") return undefined;
  let value: string | null = null;
  try {
    value = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    value = null;
  }
  if (!isUuid(value)) value = crypto.randomUUID();
  try {
    window.localStorage.setItem(STORAGE_KEY, value!);
  } catch {
    // Cookies still preserve the identifier when browser storage is unavailable.
  }
  document.cookie = `${STORAGE_KEY}=${encodeURIComponent(value!)}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax${
    window.location.protocol === "https:" ? "; Secure" : ""
  }`;
  return value!;
}

export function isTrackablePublicPage(pathname: string) {
  const blocked = ["/admin", "/agency", "/cleaner", "/sign-in", "/accept-invitation", "/api"];
  if (blocked.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return false;
  }
  const host = window.location.hostname.toLowerCase();
  return (
    host === "wedocleaning.com.au" ||
    host === "www.wedocleaning.com.au" ||
    host === "localhost" ||
    host === "127.0.0.1"
  );
}

export function browserContext() {
  const agent = navigator.userAgent;
  const deviceType = /ipad|tablet/i.test(agent)
    ? "Tablet"
    : /mobile|iphone|android/i.test(agent)
      ? "Mobile"
      : "Desktop";
  const browser = /edg/i.test(agent)
    ? "Edge"
    : /chrome|crios/i.test(agent)
      ? "Chrome"
      : /safari/i.test(agent)
        ? "Safari"
        : /firefox|fxios/i.test(agent)
          ? "Firefox"
          : "Other";
  const os = /windows/i.test(agent)
    ? "Windows"
    : /iphone|ipad|ios/i.test(agent)
      ? "iOS"
      : /mac os/i.test(agent)
        ? "macOS"
        : /android/i.test(agent)
          ? "Android"
          : /linux/i.test(agent)
            ? "Linux"
            : "Other";
  return { deviceType, browser, os };
}
