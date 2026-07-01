import { useEffect, useState } from "react";

export type MobileNavVariant = "floating" | "hamburger" | "tabbar";

export const MOBILE_NAV_VARIANTS: {
  id: MobileNavVariant;
  label: string;
  description: string;
}[] = [
  {
    id: "floating",
    label: "Floating dock",
    description: "شناور در پایین صفحه با افکت محو/گلس",
  },
  {
    id: "hamburger",
    label: "Hamburger top",
    description: "دکمه همبرگری در بالای صفحه با منوی کشویی",
  },
  {
    id: "tabbar",
    label: "Bottom tab bar",
    description: "نوار زبانه‌ای چسبیده به پایین با آیکون و برچسب",
  },
];

const KEY = "liteminer:mobile-nav-variant";
const EVENT = "liteminer:mobile-nav-change";

export function getStoredMobileNav(): MobileNavVariant {
  if (typeof window === "undefined") return "floating";
  const v = window.localStorage.getItem(KEY);
  if (v === "floating" || v === "hamburger" || v === "tabbar") return v;
  return "floating";
}

export function setStoredMobileNav(v: MobileNavVariant) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, v);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: v }));
}

export function useMobileNavVariant(): [MobileNavVariant, (v: MobileNavVariant) => void] {
  const [variant, setVariant] = useState<MobileNavVariant>("floating");
  useEffect(() => {
    setVariant(getStoredMobileNav());
    const onChange = () => setVariant(getStoredMobileNav());
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  return [variant, setStoredMobileNav];
}
