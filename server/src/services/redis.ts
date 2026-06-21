import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    if (!process.env.REDIS_URL) {
      console.warn(
        "⚠️  WARNING: REDIS_URL environment variable is not set! Falling back to localhost.",
      );
      console.warn(
        "   If you are deploying on Render or another cloud platform, you MUST set REDIS_URL to your Redis instance's connection string.",
      );
    }
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    
    const isTls = url.startsWith("rediss://");
    
    redis = new Redis(url, {
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false,
      ...(isTls ? { tls: { rejectUnauthorized: false } } : {}),
      retryStrategy: (times: number) => {
        if (times > 10) {
          console.error("[REDIS] Max retries exceeded, giving up");
          return null;
        }
        const delay = Math.min(times * 200, 3000);
        console.log(
          `[REDIS] Retrying connection in ${delay}ms (attempt ${times})`,
        );
        return delay;
      },
    });

    redis.on("connect", () => {
      console.log("[REDIS] Connected successfully");
    });

    redis.on("error", (err) => {
      console.error("[REDIS] Connection error:", err.message);
    });
  }
  return redis;
}

/**
 * Create a separate Redis connection for BullMQ (it needs its own).
 */
export function createBullMQConnection(): Redis {
  const url = process.env.REDIS_URL || "redis://localhost:6379";
  const isTls = url.startsWith("rediss://");
  
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...(isTls ? { tls: { rejectUnauthorized: false } } : {}),
  });
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
