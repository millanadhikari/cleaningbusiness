"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const sectionSelectors: Record<string, string> = {
  "#services": ".benefit-strip + section",
  "#bond-guarantee": ".bond-section",
  "#why-wedo": ".why-section",
  "#service-areas": ".sydney-section",
};

export function PublicHashNavigation() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/") return;
    const selector = sectionSelectors[window.location.hash];
    if (!selector) return;
    window.requestAnimationFrame(() => {
      document.querySelector(selector)?.scrollIntoView({ block: "start" });
    });
  }, [pathname]);

  return null;
}
