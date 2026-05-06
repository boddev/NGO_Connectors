import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js";
import { connectionId } from "../config/connection.js";
import type { ExternalItemPayload } from "../dataSources/types.js";

let _client: Client | null = null;

/**
 * Initialize or return the cached Microsoft Graph client.
 * Uses application permissions with client secret credential.
 */
export function getGraphClient(): Client {
  if (_client) return _client;

  const tenantId = process.env.TENANT_ID;
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      "Missing required environment variables: TENANT_ID, CLIENT_ID, CLIENT_SECRET"
    );
  }

  const credential = new ClientSecretCredential(
    tenantId,
    clientId,
    clientSecret
  );

  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ["https://graph.microsoft.com/.default"],
  });

  _client = Client.initWithMiddleware({ authProvider });
  return _client;
}

/**
 * Create the external connection in Microsoft Graph.
 */
export async function createConnection(
  payload: Record<string, unknown>
): Promise<void> {
  const client = getGraphClient();
  await client.api("/external/connections").post({
    id: payload.id,
    name: payload.name,
    description: payload.description,
  });
}

/**
 * Register the schema for the connection.
 * This is asynchronous — call pollSchemaStatus() after.
 */
export async function registerSchema(
  schemaPayload: Record<string, unknown>
): Promise<void> {
  const client = getGraphClient();
  await client
    .api(`/external/connections/${connectionId}/schema`)
    .patch(schemaPayload);
}

/**
 * Poll schema registration status until complete or failed.
 * Schema registration can take up to 10 minutes.
 */
export async function pollSchemaStatus(): Promise<string> {
  const client = getGraphClient();
  const maxAttempts = 30; // 30 × 30s = 15 minutes max

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const schema = await client
      .api(`/external/connections/${connectionId}/schema`)
      .get();

    const state: string =
      schema?.status?.state ??
      (typeof schema?.status === "string" ? schema.status : undefined) ??
      (Array.isArray(schema?.properties) && schema.properties.length > 0
        ? "completed"
        : "unknown");
    console.log(`Schema status (attempt ${attempt + 1}): ${state}`);

    if (state === "completed") return state;
    if (state === "failed") {
      throw new Error(
        `Schema registration failed: ${JSON.stringify(schema?.status)}`
      );
    }

    await new Promise((r) => setTimeout(r, 30_000));
  }

  throw new Error("Schema registration timed out after 15 minutes");
}

/**
 * Upsert an external item with throttle-resilient retry.
 * Handles HTTP 429 with exponential backoff using Retry-After header.
 */
export async function putItem(
  item: ExternalItemPayload,
  maxRetries = 5
): Promise<void> {
  const client = getGraphClient();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await client
        .api(
          `/external/connections/${connectionId}/items/${encodeURIComponent(item.id)}`
        )
        .put(item);
      return;
    } catch (error: unknown) {
      const err = error as {
        statusCode?: number;
        headers?: Record<string, string> | { get(name: string): string | null };
      };
      const statusCode = err.statusCode ?? 0;
      const shouldRetry =
        (statusCode === 429 || statusCode >= 500) && attempt < maxRetries;
      if (shouldRetry) {
        const headersWithGet = err.headers as
          | { get?: (name: string) => string | null }
          | undefined;
        const headerRecord = err.headers as Record<string, string> | undefined;
        const retryAfterHeader =
          typeof headersWithGet?.get === "function"
            ? headersWithGet.get("retry-after")
            : headerRecord?.["retry-after"];
        const retryAfter = parseInt(retryAfterHeader ?? String(2 ** attempt), 10);
        console.warn(
          `Graph request failed with ${statusCode}. Retrying in ${retryAfter}s (attempt ${attempt + 1}/${maxRetries})`
        );
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
      } else {
        throw error;
      }
    }
  }
}

/**
 * Delete an external item by ID.
 */
export async function deleteItem(itemId: string): Promise<void> {
  const client = getGraphClient();
  await client
    .api(
      `/external/connections/${connectionId}/items/${encodeURIComponent(itemId)}`
    )
    .delete();
}

/**
 * Delete the entire connection (for reset/cleanup).
 */
export async function deleteConnection(): Promise<void> {
  const client = getGraphClient();
  await client.api(`/external/connections/${connectionId}`).delete();
}



