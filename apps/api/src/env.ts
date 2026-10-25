export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "postgres://clinic_app:clinic_app@localhost:5432/clinic",
  databaseUrlAdmin: process.env.DATABASE_URL_ADMIN ?? "postgres://clinic:clinic@localhost:5432/clinic",
  dataKey: process.env.CLINIC_DATA_KEY ?? "dev-only-data-key",
  temporalAddress: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  minioEndPoint: process.env.MINIO_ENDPOINT ?? "localhost",
  minioPort: Number(process.env.MINIO_PORT ?? 9000),
  minioAccessKey: process.env.MINIO_ACCESS_KEY ?? "minio",
  minioSecretKey: process.env.MINIO_SECRET_KEY ?? "minio12345",
  minioBucket: process.env.MINIO_BUCKET ?? "documents",
  authSecret: process.env.BETTER_AUTH_SECRET ?? "dev-better-auth-secret-32chars-min",
  authUrl: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  internalToken: process.env.INTERNAL_TOKEN ?? "dev-internal-token",
  browserRunnerUrl: process.env.BROWSER_RUNNER_URL ?? "http://localhost:4020",
  sandboxEhrUrl: process.env.SANDBOX_EHR_URL ?? "http://localhost:4010",
  sandboxPayerUrl: process.env.SANDBOX_PAYER_URL ?? "http://localhost:4011",
  port: Number(process.env.PORT ?? 4000),
  seedEmail: process.env.SEED_EMAIL ?? "staff@demo.clinic",
  seedPassword: process.env.SEED_PASSWORD ?? "password-demo-1",
  seedClinicName: process.env.SEED_CLINIC_NAME ?? "Demo GI",
  seedUserCount: Number(process.env.SEED_USER_COUNT ?? 0),
  seedEmailDomain: process.env.SEED_EMAIL_DOMAIN ?? "",
  seedEmailGroups: (process.env.SEED_EMAIL_GROUPS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  seedDoctorGroups: (process.env.SEED_DOCTOR_GROUPS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "",
};
