import { SecretClient } from "@azure/keyvault-secrets";
import { DefaultAzureCredential } from "@azure/identity";
import fs from "fs";
import path from "path";

const KEY_VAULT_URL = process.env.KEY_VAULT_URL || "";
const SECRETS_FILE = path.join(__dirname, "..", "..", "data", "secrets.json");

function secretKey(tenantId: string, secretName: string): string {
  return `tenant-${tenantId}-${secretName}`;
}

// Azure Key Vault-backed store
class AzureKeyVaultStore {
  private client: SecretClient;

  constructor(vaultUrl: string) {
    this.client = new SecretClient(vaultUrl, new DefaultAzureCredential());
  }

  async storeSecret(
    tenantId: string,
    secretName: string,
    secretValue: string
  ): Promise<void> {
    await this.client.setSecret(secretKey(tenantId, secretName), secretValue);
  }

  async getSecret(
    tenantId: string,
    secretName: string
  ): Promise<string | null> {
    try {
      const secret = await this.client.getSecret(
        secretKey(tenantId, secretName)
      );
      return secret.value ?? null;
    } catch (err: any) {
      if (err.statusCode === 404 || err.code === "SecretNotFound") return null;
      throw err;
    }
  }

  async deleteSecret(tenantId: string, secretName: string): Promise<boolean> {
    try {
      const poller = await this.client.beginDeleteSecret(
        secretKey(tenantId, secretName)
      );
      await poller.pollUntilDone();
      return true;
    } catch (err: any) {
      if (err.statusCode === 404 || err.code === "SecretNotFound") return false;
      throw err;
    }
  }

  async listSecrets(tenantId: string): Promise<string[]> {
    const prefix = `tenant-${tenantId}-`;
    const names: string[] = [];
    for await (const props of this.client.listPropertiesOfSecrets()) {
      if (props.name.startsWith(prefix)) {
        names.push(props.name.slice(prefix.length));
      }
    }
    return names;
  }

  async deleteTenantSecrets(tenantId: string): Promise<number> {
    const names = await this.listSecrets(tenantId);
    let deleted = 0;
    for (const name of names) {
      if (await this.deleteSecret(tenantId, name)) deleted++;
    }
    return deleted;
  }
}

// Local JSON file-backed store (dev only)
class LocalSecretStore {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private load(): Record<string, string> {
    if (!fs.existsSync(this.filePath)) return {};
    return JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
  }

  private save(data: Record<string, string>): void {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  async storeSecret(
    tenantId: string,
    secretName: string,
    secretValue: string
  ): Promise<void> {
    const data = this.load();
    data[secretKey(tenantId, secretName)] = secretValue;
    this.save(data);
  }

  async getSecret(
    tenantId: string,
    secretName: string
  ): Promise<string | null> {
    const data = this.load();
    return data[secretKey(tenantId, secretName)] ?? null;
  }

  async deleteSecret(tenantId: string, secretName: string): Promise<boolean> {
    const data = this.load();
    const key = secretKey(tenantId, secretName);
    if (!(key in data)) return false;
    delete data[key];
    this.save(data);
    return true;
  }

  async listSecrets(tenantId: string): Promise<string[]> {
    const prefix = `tenant-${tenantId}-`;
    const data = this.load();
    return Object.keys(data)
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length));
  }

  async deleteTenantSecrets(tenantId: string): Promise<number> {
    const prefix = `tenant-${tenantId}-`;
    const data = this.load();
    const keys = Object.keys(data).filter((k) => k.startsWith(prefix));
    for (const k of keys) delete data[k];
    this.save(data);
    return keys.length;
  }
}

export interface SecretStore {
  storeSecret(
    tenantId: string,
    secretName: string,
    secretValue: string
  ): Promise<void>;
  getSecret(tenantId: string, secretName: string): Promise<string | null>;
  deleteSecret(tenantId: string, secretName: string): Promise<boolean>;
  listSecrets(tenantId: string): Promise<string[]>;
  deleteTenantSecrets(tenantId: string): Promise<number>;
}

let instance: SecretStore | null = null;

export function getSecretStore(): SecretStore {
  if (!instance) {
    if (KEY_VAULT_URL) {
      console.log(
        `[keyvault] Connecting to Azure Key Vault at ${KEY_VAULT_URL}`
      );
      instance = new AzureKeyVaultStore(KEY_VAULT_URL);
    } else {
      console.log(
        "[keyvault] KEY_VAULT_URL not set — using local JSON secret store in ./data/secrets.json"
      );
      instance = new LocalSecretStore(SECRETS_FILE);
    }
  }
  return instance;
}
