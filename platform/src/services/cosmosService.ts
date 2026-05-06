import { CosmosClient, Container, Database } from "@azure/cosmos";
import { settings } from "../config/settings";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(__dirname, "..", "..", "data");

// In-memory + JSON file fallback store
class LocalStore {
  private collections: Record<string, Record<string, unknown>[]> = {};
  private dir: string;

  constructor(dir: string) {
    this.dir = dir;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private filePath(collection: string): string {
    return path.join(this.dir, `${collection}.json`);
  }

  private load(collection: string): Record<string, unknown>[] {
    if (this.collections[collection]) return this.collections[collection];
    const fp = this.filePath(collection);
    if (fs.existsSync(fp)) {
      this.collections[collection] = JSON.parse(
        fs.readFileSync(fp, "utf-8")
      );
    } else {
      this.collections[collection] = [];
    }
    return this.collections[collection];
  }

  private save(collection: string): void {
    fs.writeFileSync(
      this.filePath(collection),
      JSON.stringify(this.collections[collection], null, 2),
      "utf-8"
    );
  }

  async getAll<T>(collection: string, partitionValue?: string): Promise<T[]> {
    const items = this.load(collection);
    if (partitionValue) {
      return items.filter(
        (i: any) => i.tenantId === partitionValue
      ) as T[];
    }
    return items as T[];
  }

  async getById<T>(
    collection: string,
    id: string,
    _partitionValue?: string
  ): Promise<T | null> {
    const items = this.load(collection);
    const item = items.find((i: any) => i.id === id);
    return (item as T) || null;
  }

  async create<T extends { id: string }>(
    collection: string,
    item: T
  ): Promise<T> {
    const items = this.load(collection);
    items.push(item as unknown as Record<string, unknown>);
    this.save(collection);
    return item;
  }

  async upsert<T extends { id: string }>(
    collection: string,
    item: T
  ): Promise<T> {
    const items = this.load(collection);
    const idx = items.findIndex((i: any) => i.id === item.id);
    if (idx >= 0) {
      items[idx] = item as unknown as Record<string, unknown>;
    } else {
      items.push(item as unknown as Record<string, unknown>);
    }
    this.save(collection);
    return item;
  }

  async update<T extends { id: string }>(
    collection: string,
    id: string,
    updates: Partial<T>,
    _partitionValue?: string
  ): Promise<T | null> {
    const items = this.load(collection);
    const idx = items.findIndex((i: any) => i.id === id);
    if (idx < 0) return null;
    items[idx] = { ...items[idx], ...updates };
    this.save(collection);
    return items[idx] as T;
  }

  async delete(
    collection: string,
    id: string,
    _partitionValue?: string
  ): Promise<boolean> {
    const items = this.load(collection);
    const idx = items.findIndex((i: any) => i.id === id);
    if (idx < 0) return false;
    items.splice(idx, 1);
    this.save(collection);
    return true;
  }
}

// Cosmos DB-backed store
class CosmosStore {
  private client: CosmosClient;
  private db: Database;
  private containers: Record<string, Container> = {};

  constructor() {
    this.client = new CosmosClient({
      endpoint: settings.cosmos.endpoint,
      key: settings.cosmos.key,
    });
    this.db = this.client.database(settings.cosmos.database);
  }

  private container(name: string): Container {
    if (!this.containers[name]) {
      this.containers[name] = this.db.container(name);
    }
    return this.containers[name];
  }

  async getAll<T>(collection: string, partitionValue?: string): Promise<T[]> {
    const c = this.container(collection);
    let query = "SELECT * FROM c";
    const params: { name: string; value: string }[] = [];
    if (partitionValue) {
      query += " WHERE c.tenantId = @tenantId";
      params.push({ name: "@tenantId", value: partitionValue });
    }
    const { resources } = await c.items
      .query({ query, parameters: params })
      .fetchAll();
    return resources as T[];
  }

  async getById<T>(
    collection: string,
    id: string,
    partitionValue?: string
  ): Promise<T | null> {
    try {
      const c = this.container(collection);
      const { resource } = await c
        .item(id, partitionValue || id)
        .read();
      return (resource as unknown as T) || null;
    } catch (err: any) {
      if (err.code === 404) return null;
      throw err;
    }
  }

  async create<T extends { id: string }>(
    collection: string,
    item: T
  ): Promise<T> {
    const c = this.container(collection);
    const { resource } = await c.items.create(item);
    return resource as unknown as T;
  }

  async upsert<T extends { id: string }>(
    collection: string,
    item: T
  ): Promise<T> {
    const c = this.container(collection);
    const { resource } = await c.items.upsert(item);
    return resource as unknown as T;
  }

  async update<T extends { id: string }>(
    collection: string,
    id: string,
    updates: Partial<T>,
    partitionValue?: string
  ): Promise<T | null> {
    const existing = await this.getById<T>(collection, id, partitionValue);
    if (!existing) return null;
    const merged = { ...existing, ...updates };
    const c = this.container(collection);
    const { resource } = await c
      .item(id, partitionValue || id)
      .replace(merged);
    return resource as unknown as T;
  }

  async delete(
    collection: string,
    id: string,
    partitionValue?: string
  ): Promise<boolean> {
    try {
      const c = this.container(collection);
      await c.item(id, partitionValue || id).delete();
      return true;
    } catch (err: any) {
      if (err.code === 404) return false;
      throw err;
    }
  }
}

export interface DataStore {
  getAll<T>(collection: string, partitionValue?: string): Promise<T[]>;
  getById<T>(
    collection: string,
    id: string,
    partitionValue?: string
  ): Promise<T | null>;
  create<T extends { id: string }>(collection: string, item: T): Promise<T>;
  upsert<T extends { id: string }>(collection: string, item: T): Promise<T>;
  update<T extends { id: string }>(
    collection: string,
    id: string,
    updates: Partial<T>,
    partitionValue?: string
  ): Promise<T | null>;
  delete(
    collection: string,
    id: string,
    partitionValue?: string
  ): Promise<boolean>;
}

let storeInstance: DataStore | null = null;

export function getStore(): DataStore {
  if (!storeInstance) {
    if (settings.useLocalFallback) {
      console.log(
        "[cosmos] COSMOS_ENDPOINT not set — using local JSON file store in ./data/"
      );
      storeInstance = new LocalStore(DATA_DIR);
    } else {
      console.log(
        `[cosmos] Connecting to Cosmos DB at ${settings.cosmos.endpoint}`
      );
      storeInstance = new CosmosStore();
    }
  }
  return storeInstance;
}

// Collection names
export const TENANTS = "tenants";
export const CONNECTORS = "connectors";
export const UPLOADS = "uploads";
export const JOBS = "jobs";
