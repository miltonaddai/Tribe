/**
 * Cloudflare R2 object storage for avatars, clothing, cars.
 * Configure R2_* env vars to enable signed uploads later.
 */
export function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET,
  );
}

export function assetUrl(key: string): string {
  const base = process.env.R2_PUBLIC_URL;
  if (!base) return `/assets/${key}`;
  return `${base.replace(/\/$/, "")}/${key}`;
}
