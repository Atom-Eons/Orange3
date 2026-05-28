import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(8797),
  DATABASE_URL: z.string().min(1).default("postgresql://ae:ae@localhost:5432/ae_see_suite"),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  MODEL_PROVIDER: z.enum(["mock", "remote"]).default("mock"),
  MODEL_API_KEY: z.string().optional(),
  OBJECT_STORAGE_BUCKET: z.string().optional(),
  VECTOR_DATABASE_URL: z.string().optional(),
});

export const env = EnvSchema.parse(process.env);
