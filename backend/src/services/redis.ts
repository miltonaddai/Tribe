/** Redis presence / sessions. Wired when REDIS_URL is set. */
export function redisEnabled(): boolean {
  return Boolean(process.env.REDIS_URL);
}
