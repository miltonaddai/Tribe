export function isDevToolsEnabled() {
  const value = import.meta.env.VITE_DEV_TOOLS;
  return value === "true" || value === "1";
}
