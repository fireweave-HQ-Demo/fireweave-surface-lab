import { Client } from "minio";
import { env } from "./env";

export const blobs = new Client({
  endPoint: env.minioEndPoint,
  port: env.minioPort,
  useSSL: false,
  accessKey: env.minioAccessKey,
  secretKey: env.minioSecretKey,
});

export async function ensureBucket() {
  const exists = await blobs.bucketExists(env.minioBucket).catch(() => false);
  if (!exists) await blobs.makeBucket(env.minioBucket);
}

export async function putPdf(key: string, body: Buffer) {
  await blobs.putObject(env.minioBucket, key, body, body.length, { "Content-Type": "application/pdf" });
}

export async function getPdf(key: string): Promise<Buffer> {
  const stream = await blobs.getObject(env.minioBucket, key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
