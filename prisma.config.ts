import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // Generation does not connect. Runtime and migrations validate real configuration.
    url:
      process.env.DATABASE_URL ??
      "postgresql://unused:unused@localhost:5432/unused",
  },
});
