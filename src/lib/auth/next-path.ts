export function safeNextPath(value: string | null | undefined) {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value.includes("://") || value.includes("\\")) return "/";
  const pathOnly = value.split("?")[0] ?? value;
  if (
    pathOnly === "/login" ||
    pathOnly.startsWith("/login/") ||
    pathOnly === "/setup" ||
    pathOnly.startsWith("/setup/")
  ) {
    return "/";
  }
  return value;
}
