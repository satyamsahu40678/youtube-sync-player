import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    redis = new Redis(url, {
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false,
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
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
