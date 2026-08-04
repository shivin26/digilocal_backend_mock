/**
 * High-Performance In-Memory TTL Cache Strategy.
 * Reduces database load for read-heavy public endpoints (societies, platform config, storefront listings).
 */

class MemoryCache {
  constructor(defaultTtlMs = 60000) {
    this.cache = new Map();
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Retrieves a cached item if valid and not expired.
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Sets an item in the cache with a specific or default TTL.
   */
  set(key, value, ttlMs = this.defaultTtlMs) {
    const expiresAt = Date.now() + ttlMs;
    this.cache.set(key, { value, expiresAt });
  }

  /**
   * Invalidates a single key or pattern prefix.
   */
  del(pattern) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clears the entire cache.
   */
  clear() {
    this.cache.clear();
  }
}

const memoryCache = new MemoryCache(60000); // 60-second default TTL
module.exports = memoryCache;
