export interface HyperdriveBinding {
  connectionString: string;
}

export interface Env {
  HENDY_API_ORIGIN: string;
  ALLOWED_ORIGIN?: string;
  DATABASE_PROVIDER?: "postgres" | "mysql" | "d1" | "none";
  HYPERDRIVE?: HyperdriveBinding;
  MYSQL_HYPERDRIVE?: HyperdriveBinding;
  DB?: D1Database;
  R2?: R2Bucket;
  CACHE?: KVNamespace;
  EVENTS_QUEUE?: Queue;

  OBJECT_STORAGE_PROVIDER?: "neon" | "cloudfly" | "r2" | "s3";
  OBJECT_STORAGE_ENDPOINT?: string;
  OBJECT_STORAGE_REGION?: string;
  OBJECT_STORAGE_BUCKET?: string;
  OBJECT_STORAGE_ACCESS_KEY_ID?: string;
  OBJECT_STORAGE_SECRET_ACCESS_KEY?: string;
  OBJECT_STORAGE_SESSION_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  OBJECT_STORAGE_FORCE_PATH_STYLE?: string;

  /** Optional server-side token for internal monitoring; never returned to clients. */
  PLATFORM_HEALTH_TOKEN?: string;
}