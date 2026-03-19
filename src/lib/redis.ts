/**
 * Upstash Redis Client
 *
 * WHY: Redis client for caching and realtime pub/sub
 * HOW: Uses Upstash REST API (serverless-compatible)
 *
 * SOURCE OF TRUTH KEYWORDS: RedisClient, UpstashRedis
 */

import { Redis } from '@upstash/redis'

// Singleton pattern to prevent multiple instances during HMR
const GLOBAL_REDIS_KEY = Symbol.for('mochi.upstash.redis')

type GlobalWithRedis = typeof globalThis & {
  [GLOBAL_REDIS_KEY]?: Redis
}

function getRedisClient(): Redis {
  const globalWithRedis = globalThis as GlobalWithRedis

  if (!globalWithRedis[GLOBAL_REDIS_KEY]) {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN

    if (!url || !token) {
      throw new Error(
        'Missing Upstash Redis credentials. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.'
      )
    }

    globalWithRedis[GLOBAL_REDIS_KEY] = new Redis({ url, token })
  }

  return globalWithRedis[GLOBAL_REDIS_KEY]
}

export const redis = getRedisClient()
