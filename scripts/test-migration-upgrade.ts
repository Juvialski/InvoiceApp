import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const FIXTURES_DIR = path.join(ROOT, "tests", "migrations", "fixtures");
const BOOTSTRAP_SQL = path.join(ROOT, "tests", "db", "integrationBootstrap.sql");

interface FixtureMeta {
  id: string;
  name: string;
  description: string;
  boundaryMigration: string;
}

export async function runUpgradeTests(options: { dbUrl?: string; throwOnUnreachable?: boolean } = {}) {
  const dbUrl =
    options.dbUrl ||
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.PAYROLL_RESET_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

  console.log(`\n🔍 Connecting to PostgreSQL database for upgrade-path tests...`);
  console.log(`   Target: ${dbUrl.replace(/:[^:@]+@/, ":****@")}`);

  const client = new Client({ connectionString: dbUrl });

  try {
    await client.connect();
  } catch (err: any) {
    const message = `Could not connect to PostgreSQL database at ${dbUrl.replace(/:[^:@]+@/, ":****@")}: ${err.message}`;
    if (options.throwOnUnreachable) {
      throw new Error(message);
    } else {
      console.warn(`\n⚠️  ${message}`);
      console.warn(`   Skipping live upgrade-path tests. Run 'npx supabase start' or set DATABASE_URL to execute them.\n`);
      return { skipped: true, reason: message };
    }
  }

  try {
    const allMigrations = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    console.log(`📦 Found ${allMigrations.length} total migration files.`);

    const fixtureDirs = existsSync(FIXTURES_DIR)
      ? readdirSync(FIXTURES_DIR, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
          .sort()
      : [];

    if (fixtureDirs.length === 0) {
      console.log(`ℹ No upgrade fixtures found in ${FIXTURES_DIR}`);
      return { passed: 0, failed: 0 };
    }

    console.log(`🧪 Running ${fixtureDirs.length} upgrade-path fixture(s)...`);

    for (const fixtureDir of fixtureDirs) {
      const fixturePath = path.join(FIXTURES_DIR, fixtureDir);
      const metaPath = path.join(fixturePath, "meta.json");
      const seedPath = path.join(fixturePath, "seed.sql");
      const assertPath = path.join(fixturePath, "post_assert.sql");

      if (!existsSync(metaPath) || !existsSync(seedPath) || !existsSync(assertPath)) {
        throw new Error(`Fixture ${fixtureDir} is missing required meta.json, seed.sql, or post_assert.sql`);
      }

      const meta: FixtureMeta = JSON.parse(readFileSync(metaPath, "utf8"));
      console.log(`\n============================================================`);
      console.log(`▶ Fixture: [${meta.id}] ${meta.name}`);
      console.log(`  Description: ${meta.description}`);
      console.log(`  Boundary Migration: ${meta.boundaryMigration}`);
      console.log(`============================================================`);

      const boundaryIndex = allMigrations.indexOf(meta.boundaryMigration);
      if (boundaryIndex === -1) {
        throw new Error(
          `Boundary migration "${meta.boundaryMigration}" not found among existing migrations.`
        );
      }

      const preMigrations = allMigrations.slice(0, boundaryIndex + 1);
      const postMigrations = allMigrations.slice(boundaryIndex + 1);

      console.log(`  1. Resetting database schema to clean state...`);
      await client.query(`
        drop schema if exists public cascade;
        drop schema if exists private cascade;
        create schema public;
        create schema private;
        grant usage, create on schema public to public, anon, authenticated, service_role, postgres;
        grant all on all tables in schema public to postgres, service_role, authenticated, anon;
        grant usage, create on schema private to postgres, service_role;
      `);

      // Ensure auth/storage bootstrap only if running on standalone postgres without Supabase
      const authExists = await client.query(`select to_regclass('auth.users') as exists;`);
      if (!authExists.rows[0]?.exists && existsSync(BOOTSTRAP_SQL)) {
        const bootstrapContent = readFileSync(BOOTSTRAP_SQL, "utf8");
        await client.query(bootstrapContent);
      }

      console.log(`  2. Applying ${preMigrations.length} pre-boundary migrations (up to ${meta.boundaryMigration})...`);
      for (const m of preMigrations) {
        const sql = readFileSync(path.join(MIGRATIONS_DIR, m), "utf8");
        try {
          await client.query("BEGIN");
          await client.query(sql);
          await client.query("COMMIT");
        } catch (err: any) {
          await client.query("ROLLBACK");
          console.error(`\n❌ Failed during pre-boundary migration "${m}":\n   ${err.message}`);
          throw err;
        }
      }

      console.log(`  3. Seeding representative historical data from seed.sql...`);
      const seedSql = readFileSync(seedPath, "utf8");
      try {
        await client.query(seedSql);
      } catch (err: any) {
        console.error(`\n❌ Failed executing seed.sql for fixture "${meta.id}":\n   ${err.message}`);
        throw err;
      }

      console.log(`  4. Applying ${postMigrations.length} remaining migrations...`);
      for (const m of postMigrations) {
        const sql = readFileSync(path.join(MIGRATIONS_DIR, m), "utf8");
        try {
          await client.query("BEGIN");
          await client.query(sql);
          await client.query("COMMIT");
        } catch (err: any) {
          await client.query("ROLLBACK");
          console.error(`\n❌ UPGRADE REGRESSION DETECTED!`);
          console.error(`   Fixture:             ${meta.id} (${meta.name})`);
          console.error(`   Failed Migration:    ${m}`);
          console.error(`   SQLSTATE:            ${err.code || "UNKNOWN"}`);
          if (err.constraint) console.error(`   Violated Constraint: ${err.constraint}`);
          if (err.table) console.error(`   Table:               ${err.table}`);
          if (err.detail) console.error(`   Detail:              ${err.detail}`);
          console.error(`   Message:             ${err.message}\n`);
          throw new Error(`Upgrade path failed at migration ${m}: [${err.code}] ${err.message}`);
        }
      }

      console.log(`  5. Running post-upgrade assertions from post_assert.sql...`);
      const assertSql = readFileSync(assertPath, "utf8");
      try {
        await client.query(assertSql);
      } catch (err: any) {
        console.error(`\n❌ Post-upgrade assertion failed for fixture "${meta.id}":\n   ${err.message}`);
        throw err;
      }

      console.log(`  ✔ Fixture "${meta.id}" PASSED.`);
    }

    console.log(`\n🎉 All upgrade-path fixtures passed successfully!`);
    return { passed: fixtureDirs.length, failed: 0 };
  } finally {
    await client.end();
  }
}

// Direct execution
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const requireDb = process.argv.includes("--require-db") || process.env.CI === "true";
  runUpgradeTests({ throwOnUnreachable: requireDb })
    .then((res) => {
      if (res && (res as any).skipped && requireDb) {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
