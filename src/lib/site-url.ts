/**
 * Returns the app's public origin for server-side auth and billing redirects.
 * Vercel supplies deployment URLs automatically, so production does not need
 * a manually configured NEXT_PUBLIC_SITE_URL.
 */
export function getSiteUrl() {
  const vercelDomain =
    process.env.VERCEL_ENV === "production"
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.VERCEL_URL;
  const configuredUrl = vercelDomain || process.env.NEXT_PUBLIC_SITE_URL;
  const normalizedUrl = configuredUrl?.trim().replace(/\/+$/, "");

  if (!normalizedUrl) return "http://localhost:3000";
  return /^https?:\/\//i.test(normalizedUrl)
    ? normalizedUrl
    : `https://${normalizedUrl}`;
}
