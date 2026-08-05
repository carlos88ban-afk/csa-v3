import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Motor engine/evidences v1 (ver docs/engines/evidences.md). Cliente S3 para
// Cloudflare R2 — solo se importa desde rutas API del servidor, nunca desde
// componentes cliente (las credenciales no pueden llegar al bundle del
// navegador). Los binarios nunca pasan por la función serverless: se usan
// presigned URLs (PUT para subir, GET para descargar), con validez de 5 min.

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET_NAME;

const configured =
  Boolean(accountId) && Boolean(accessKeyId) && Boolean(secretAccessKey) && Boolean(bucket);

let client: S3Client | null = null;
function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
    });
  }
  return client;
}

// Prefijo de la Evaluación dentro del bucket: `evaluations/{evaluationId}/`.
// Toda key se valida contra este prefijo antes de operar — impide que el
// token de una Evaluación acceda a archivos de otra (anti-IDOR por key).
export function evidenceKeyOf(evaluationId: string, objectId: string): string {
  return `evaluations/${evaluationId}/${objectId}`;
}

export function belongsToEvaluation(key: string, evaluationId: string): boolean {
  return key.startsWith(`evaluations/${evaluationId}/`);
}

export function isR2Configured(): boolean {
  return configured;
}

export async function createUploadUrl(
  evaluationId: string,
  objectId: string,
  contentType: string,
  size: number,
): Promise<{ key: string; url: string }> {
  const key = evidenceKeyOf(evaluationId, objectId);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: size,
  });
  const url = await getSignedUrl(getClient(), command, { expiresIn: 300 });
  return { key, url };
}

export async function createDownloadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(getClient(), command, { expiresIn: 300 });
}

export async function evidenceExists(key: string): Promise<boolean> {
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function deleteEvidence(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
