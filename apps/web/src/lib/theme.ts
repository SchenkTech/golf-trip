/** Light/dark mode, on top of the system-preference default theme.css
 *  already handles via prefers-color-scheme. "system" (the default) stores
 *  nothing and removes the attribute; an explicit choice stamps
 *  document.documentElement.dataset.theme, which theme.css's `[data-theme]`
 *  blocks are already structured to win over the media query either way.
 *  index.html applies the stored value inline, before first paint, so
 *  there's no flash -- this module is what every change makes after that. */

export type ThemeChoice = "light" | "dark" | "system";

const KEY = "gc:theme";

export function getThemeChoice(): ThemeChoice {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function setThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Nothing to do -- applying the attribute below still works for this
    // page load, it just won't stick across a reload.
  }
  if (choice === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
}
