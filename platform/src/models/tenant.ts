import { TenantType, TenantStatus, TenantPlan } from "../types";

export interface Tenant {
  id: string;
  name: string;
  type: TenantType;
  status: TenantStatus;
  entraAppRegistration: {
    tenantId: string;
    clientId: string;
  };
  plan: TenantPlan;
  quotas: {
    maxConnectors: number;
    maxUploadSizeMB: number;
    maxItemsPerDay: number;
    maxConcurrentCrawls: number;
  };
  contacts: {
    admin: string;
    technical: string;
  };
  createdAt: string;
  updatedAt: string;
}

const VALID_TYPES: TenantType[] = ["customer", "partner", "internal"];
const VALID_STATUSES: TenantStatus[] = ["active", "suspended", "deactivated"];
const VALID_PLANS: TenantPlan[] = ["free", "standard", "enterprise"];

const DEFAULT_QUOTAS: Record<TenantPlan, Tenant["quotas"]> = {
  free: {
    maxConnectors: 2,
    maxUploadSizeMB: 50,
    maxItemsPerDay: 1000,
    maxConcurrentCrawls: 1,
  },
  standard: {
    maxConnectors: 10,
    maxUploadSizeMB: 500,
    maxItemsPerDay: 50000,
    maxConcurrentCrawls: 3,
  },
  enterprise: {
    maxConnectors: 50,
    maxUploadSizeMB: 5000,
    maxItemsPerDay: 500000,
    maxConcurrentCrawls: 10,
  },
};

export function getDefaultQuotas(plan: TenantPlan): Tenant["quotas"] {
  return { ...DEFAULT_QUOTAS[plan] };
}

export interface CreateTenantInput {
  name: string;
  type: TenantType;
  plan?: TenantPlan;
  entraAppRegistration: {
    tenantId: string;
    clientId: string;
  };
  contacts: {
    admin: string;
    technical: string;
  };
}

export function validateCreateTenant(
  body: unknown
): { valid: true; data: CreateTenantInput } | { valid: false; error: string } {
  const b = body as Record<string, unknown>;

  if (!b || typeof b !== "object") {
    return { valid: false, error: "Request body must be a JSON object" };
  }
  if (!b.name || typeof b.name !== "string") {
    return { valid: false, error: "name is required and must be a string" };
  }
  if (!b.type || !VALID_TYPES.includes(b.type as TenantType)) {
    return {
      valid: false,
      error: `type must be one of: ${VALID_TYPES.join(", ")}`,
    };
  }
  if (b.plan && !VALID_PLANS.includes(b.plan as TenantPlan)) {
    return {
      valid: false,
      error: `plan must be one of: ${VALID_PLANS.join(", ")}`,
    };
  }

  const entra = b.entraAppRegistration as Record<string, unknown> | undefined;
  if (!entra || !entra.tenantId || !entra.clientId) {
    return {
      valid: false,
      error:
        "entraAppRegistration with tenantId and clientId is required",
    };
  }

  const contacts = b.contacts as Record<string, unknown> | undefined;
  if (!contacts || !contacts.admin || !contacts.technical) {
    return {
      valid: false,
      error: "contacts with admin and technical emails is required",
    };
  }

  return {
    valid: true,
    data: {
      name: b.name as string,
      type: b.type as TenantType,
      plan: (b.plan as TenantPlan) || "free",
      entraAppRegistration: {
        tenantId: entra.tenantId as string,
        clientId: entra.clientId as string,
      },
      contacts: {
        admin: contacts.admin as string,
        technical: contacts.technical as string,
      },
    },
  };
}

export function validateUpdateTenant(
  body: unknown
): { valid: true; data: Partial<Tenant> } | { valid: false; error: string } {
  const b = body as Record<string, unknown>;

  if (!b || typeof b !== "object") {
    return { valid: false, error: "Request body must be a JSON object" };
  }
  if (b.type && !VALID_TYPES.includes(b.type as TenantType)) {
    return {
      valid: false,
      error: `type must be one of: ${VALID_TYPES.join(", ")}`,
    };
  }
  if (b.status && !VALID_STATUSES.includes(b.status as TenantStatus)) {
    return {
      valid: false,
      error: `status must be one of: ${VALID_STATUSES.join(", ")}`,
    };
  }
  if (b.plan && !VALID_PLANS.includes(b.plan as TenantPlan)) {
    return {
      valid: false,
      error: `plan must be one of: ${VALID_PLANS.join(", ")}`,
    };
  }

  return { valid: true, data: b as Partial<Tenant> };
}
