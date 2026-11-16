/** The site's address as configured (AUTH_URL, or NEXTAUTH_URL), or null.
 * Anything that puts this site's address into an email, a shared link or a
 * server-to-server request prefers it over the request's Host /
 * X-Forwarded-Host headers — on a host that passes those through from the
 * client, a forged header would otherwise send password-reset links (or the
 * PDF renderer) to someone else's domain. Vercel sets those headers itself,
 * so leaving it unset is fine there; a self-hosted deployment must set it. */
export function configuredSiteOrigin(): string | null {
  const explicit = process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  if (!explicit) return null;
  try {
    return new URL(explicit).origin;
  } catch {
    return null;
  }
}
