export function assertDemoSeedAllowed({
  nodeEnv,
  allowDemoSeed,
  confirmedDatabaseName,
  databaseUrl,
}: {
  nodeEnv?: string;
  allowDemoSeed?: string;
  confirmedDatabaseName?: string;
  databaseUrl?: string;
}) {
  if (nodeEnv === "production") {
    throw new Error("Demo seed is disabled in production.");
  }
  if (allowDemoSeed !== "true") {
    throw new Error("Set ALLOW_DEMO_SEED=true only for an isolated demo database.");
  }

  let databaseName: string;
  try {
    const url = new URL(databaseUrl ?? "");
    if (!(["postgres:", "postgresql:"].includes(url.protocol))) throw new Error();
    databaseName = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error("A valid PostgreSQL DATABASE_URL is required for demo seed.");
  }

  if (!/(^|[-_])(dev|test|demo)([-_]|$)/i.test(databaseName)) {
    throw new Error("Demo seed requires a database name containing dev, test or demo.");
  }
  if (!confirmedDatabaseName || confirmedDatabaseName !== databaseName) {
    throw new Error("SEED_DATABASE_NAME must exactly match the database name in DATABASE_URL.");
  }
}
