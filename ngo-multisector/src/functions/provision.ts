import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { connectionPayload } from "../config/connection.js";
import { schema } from "../config/schema.js";
import {
  createConnection,
  registerSchema,
  pollSchemaStatus,
} from "../services/graphService.js";

/**
 * HTTP-triggered function to provision the connector:
 *  1. Create the external connection in Microsoft Graph
 *  2. Register the schema
 *  3. Poll until schema registration completes
 */
async function provision(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Starting connector provisioning...");

  try {
    // Step 1: Create the connection
    context.log(`Creating connection: ${connectionPayload.id}`);
    try {
      await createConnection(connectionPayload);
      context.log("Connection created successfully");
    } catch (error: unknown) {
      const err = error as { statusCode?: number };
      if (err.statusCode === 409) {
        context.log("Connection already exists, continuing to schema...");
      } else {
        throw error;
      }
    }

    // Step 2: Register the schema
    context.log("Registering schema...");
    await registerSchema(schema);

    // Step 3: Poll until complete
    context.log("Polling schema status...");
    const status = await pollSchemaStatus();
    context.log(`Schema registration completed with status: ${status}`);

    return {
      status: 200,
      jsonBody: {
        message: "Connector provisioned successfully",
        connectionId: connectionPayload.id,
        schemaStatus: status,
      },
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    context.error(`Provisioning failed: ${msg}`);
    return {
      status: 500,
      jsonBody: { error: msg },
    };
  }
}

app.http("provision", {
  methods: ["POST"],
  authLevel: "function",
  handler: provision,
});
