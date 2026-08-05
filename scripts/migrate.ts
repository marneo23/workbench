import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const connectionString =
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL_UNPOOLED or DATABASE_URL is required. Pull Vercel env to a temporary file, then merge the database variable into .env.local."
    );
  }

  const migrationsDir = path.resolve("db/migrations");
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  if (files.length === 0) throw new Error("No SQL migrations found.");

  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(connectionString);
  for (const file of files) {
    const statement = await readFile(path.join(migrationsDir, file), "utf8");
    await sql.query(statement);
    console.log(`applied ${file}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
