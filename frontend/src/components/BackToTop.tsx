import { useEffect, useState } from "react";
import { buttonClasses } from "./ui";

/** Shown once the page has scrolled further than this many screens. */
const AFTER_SCREENS = 1;

/** Whether the page has scrolled past one screen. */
export function pastOneScreen(scrollY: number, innerHeight: number): boolean {
  return scrollY > innerHeight * AFTER_SCREENS;
}

/**
 * A small "↑ Top" button, fixed at the foot of the screen on the right once the page is
 * scrolled past one screen (#922): for long pages such as Help and the Rulebook, where the
 * way back to the list at the top is a long scroll on a phone.
 */
export function BackToTop() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const check = () => setShown(pastOneScreen(window.scrollY, window.innerHeight));
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);
  if (!shown) return null;
  const top = () => {
    const reduced = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  };
  return (
    <button
      type="button"
      aria-label="Back to the top"
      onClick={top}
      className={buttonClasses("secondary", "fixed right-4 z-30 min-h-10 px-3 shadow-lg print:hidden")}
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <span aria-hidden="true">↑</span> Top
    </button>
  );
}
