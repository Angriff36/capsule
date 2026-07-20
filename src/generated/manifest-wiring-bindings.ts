/**
 * Generated Manifest product-wiring bindings.
 * DO NOT EDIT — regenerate from IR via the wiring projection.
 *
 * This module does NOT generate UI. It provides typed client inputs,
 * trusted-context injection helpers, and invalidation metadata.
 */

export const WIRING_CONTRACT_HASH = "0afa363307cd9ac3760ad9ceaaa99ceb92a60166f70f7fe5a240bad3642dfb96:16f5b86fa64677653383a3565cc55ae5abd29b5f0ab299becbd63a2a989ea054:1e85a353683f8f3cee405eae530ffef87a980786d711a48682286728ae42d2a3:21075d4f48878597cbafeabc7f13915953acbecc05e9a4359807dabb2ed87e79:27beb6e160c59bb0fbd7b7e4a260ca57ca675bd683a7366e0a0d00b3fca360a5:2a4ea95cbd23fbb7fe982f8871566507e57da4e8f02c13d207ec26d49da2b0c7:2bb75da3d2180fd598100db6ea4a5ba23b22d1c37e795f1ec70fa5dabfa5ee2c:3124934dc655f9f6e4f8ce966db19a1ed59732188ac81d5ef63953b00221815c:32756165ca0cba544f5bc9c0704a31b4ca0ed1ac0a49368f00508a41da760b5c:3cace1142ec170edf896abaae2033c1618158a914805d6f62a19889c5c016544:3eac4036bd3fbec9ded49b0ee9128c29abd2d7ed370a4a1eaba77b89dd4e0754:470ac5758d3f838778b3dfea6640c0ca03c728fae8c11e82fc805a81b783a824:49dfabd893026655ee0e439cc52624a892802114f8bc8884df33d113ff97876d:4b2e6ec9ec9ffc8b508e3e38a26dce3dc4a31267f0c46372060bd9bd7164ec8f:4d26350ace95e6633243ac163d9aa3a6d2e7d2ec67d48a36fda689220d6d7bd9:5c9fc96ba1838014c7ceb846b987c070f5901676fa0223f5a91f6ed61dae887f:5de6fbf74fdf5bbfda1602719d213343eaf691d2fbcd268b06109e04b38f54e6:62d08288929fcda84ccfeb3ef8475f33d5a867b51ba4e56ba537f030c2b9f2b3:728e61c032fe46367413548d0842c84d372b976db2ce834510b96157d0a2557b:7e7486fd901a601b2abd157671c9cf7f61583e5d775485e1c077543ace6f5767:84adc3b714a25afb1ba3a1e32b8b46bac665535ecb1fea6851b3e292fb3aa88c:84cef0a4a26771e3105beb6e7a9365b9499e8eb8f454b5082a0b2919f5a34927:856b9d38ec996605b5656a7dc0cf1be591198b151fbf7e76e15b5c2342a3c918:8bb356e37613dfd678659a9770de8fc71de9155bc8f7438d8e32bcb79c149f4d:912275cde11d5e8a1d08152b4e4a7b9ce259359101cbccb87198e639e3cda783:9e32b3a907507588d9a813328d43ea85d61feefc1a41b32b59e72ee41c2356bd:a8ecbe2b86abfca2e08c3e5a4810a228408ef970010ba70cecd5954b607e66a9:b1a8b188b293f8d5ddde7fdee91346f4f81897c89f7ff342d3671089d689d87e:ba90ae45d0e80c9a437ad3ff620ebc547764a4f6cd4cc05d572f396d2e41d157:bec4ea7d565af9b27b85ec557a71c3c29a6908d41fe7eb90630c4229d930bac6:c3c42392b912cba00235f49b58f357ab62cd011e5d194cf6103d0bd1f87daa78:cabf02d93a2bbe83580f55c66199ca137e59d0a1a350325e3d740c67a1a46730:d05949bc5ad00cd3eaf2e235a94dd8801ffbfce1dbd084f6bf7799b506cbadbb:d12bfae4193927591fa0009cb283e0afb124230d008bc18fc1090f536dc86bd5:d1c8e9bf945607639ca720a2f7b0f5819e0add00adf99f7a6a0098748c2c87d2:d6238f09f3f1f9a2dcd8703d05f8b44b3a965ca0700924109c47472d3b404032:d6910e1f58113618897b7fccf4dcbc6efd0fd1f39f05ac403e6a7f7c9a701a9f:ea25156e0553678af52f854eb24c9508395a4021ff1ddd4338bb2d178b574b08:f17ecc5a823c4120e3ad70967af44f604b10b3565b2b8034448a1ae9c9245f3f";

// --- AvailabilityWindow.declare ---
export interface AvailabilityWindowDeclareClientInput {
  personId: string;
  /** Must not be "". */
  startsAt: string & { readonly __nonEmpty?: true };
  /** Must not be "". */
  endsAt: string & { readonly __nonEmpty?: true };
  notes?: string;
}

export const AvailabilityWindowDeclareCapability = {
  capabilityId: "AvailabilityWindow.declare",
  entity: "AvailabilityWindow",
  command: "declare",
  route: "/api/manifest/AvailabilityWindow/commands/declare",
  instanceCommand: true,
  clientParameterNames: ["personId","startsAt","endsAt","notes"],
  serverParameterNames: [],
  emits: ["AvailabilityDeclared"],
} as const;

/**
 * Build command input for AvailabilityWindow.declare.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindAvailabilityWindowDeclareInput(client: AvailabilityWindowDeclareClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful AvailabilityWindow.declare. */
export const AvailabilityWindowDeclareInvalidation = [
  {
    "kind": "entityList",
    "entity": "AvailabilityWindow",
    "queryKeyHint": "queryKeys.availabilityWindow.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "AvailabilityWindow",
    "queryKeyHint": "queryKeys.availabilityWindow.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- AvailabilityWindow.withdraw ---
export type AvailabilityWindowWithdrawClientInput = Record<string, never>;

export const AvailabilityWindowWithdrawCapability = {
  capabilityId: "AvailabilityWindow.withdraw",
  entity: "AvailabilityWindow",
  command: "withdraw",
  route: "/api/manifest/AvailabilityWindow/commands/withdraw",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["AvailabilityWithdrawn"],
} as const;

/**
 * Build command input for AvailabilityWindow.withdraw.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindAvailabilityWindowWithdrawInput(client: AvailabilityWindowWithdrawClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful AvailabilityWindow.withdraw. */
export const AvailabilityWindowWithdrawInvalidation = [
  {
    "kind": "entityList",
    "entity": "AvailabilityWindow",
    "queryKeyHint": "queryKeys.availabilityWindow.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "AvailabilityWindow",
    "queryKeyHint": "queryKeys.availabilityWindow.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for AvailabilityWindow.withdraw. */
export const AvailabilityWindowWithdrawLifecycle = [
  {
    "property": "status",
    "from": "active",
    "to": "withdrawn",
    "proven": true
  }
] as const;

// --- Client.archive ---
export interface ClientArchiveClientInput {
  reason: string;
}

export const ClientArchiveCapability = {
  capabilityId: "Client.archive",
  entity: "Client",
  command: "archive",
  route: "/api/manifest/Client/commands/archive",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["ClientArchived"],
} as const;

/**
 * Build command input for Client.archive.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindClientArchiveInput(client: ClientArchiveClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Client.archive. */
export const ClientArchiveInvalidation = [
  {
    "kind": "entityList",
    "entity": "Client",
    "queryKeyHint": "queryKeys.client.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Client",
    "queryKeyHint": "queryKeys.client.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Client.archive. */
export const ClientArchiveLifecycle = [
  {
    "property": "status",
    "from": "active",
    "to": "archived",
    "proven": true
  }
] as const;

// --- Client.assignOwner ---
export interface ClientAssignOwnerClientInput {
  assignedToId?: string;
}

export const ClientAssignOwnerCapability = {
  capabilityId: "Client.assignOwner",
  entity: "Client",
  command: "assignOwner",
  route: "/api/manifest/Client/commands/assignOwner",
  instanceCommand: true,
  clientParameterNames: ["assignedToId"],
  serverParameterNames: [],
  emits: ["ClientOwnerAssigned"],
} as const;

/**
 * Build command input for Client.assignOwner.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindClientAssignOwnerInput(client: ClientAssignOwnerClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Client.assignOwner. */
export const ClientAssignOwnerInvalidation = [
  {
    "kind": "entityList",
    "entity": "Client",
    "queryKeyHint": "queryKeys.client.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Client",
    "queryKeyHint": "queryKeys.client.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Client.changeBillingProfile ---
export interface ClientChangeBillingProfileClientInput {
  /** Bounds: 0..365 */
  paymentTermsDays: number;
  taxExempt: boolean;
  taxId?: string;
}

export const ClientChangeBillingProfileCapability = {
  capabilityId: "Client.changeBillingProfile",
  entity: "Client",
  command: "changeBillingProfile",
  route: "/api/manifest/Client/commands/changeBillingProfile",
  instanceCommand: true,
  clientParameterNames: ["paymentTermsDays","taxExempt","taxId"],
  serverParameterNames: [],
  emits: ["ClientBillingProfileChanged"],
} as const;

/**
 * Build command input for Client.changeBillingProfile.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindClientChangeBillingProfileInput(client: ClientChangeBillingProfileClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Client.changeBillingProfile. */
export const ClientChangeBillingProfileInvalidation = [
  {
    "kind": "entityList",
    "entity": "Client",
    "queryKeyHint": "queryKeys.client.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Client",
    "queryKeyHint": "queryKeys.client.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Client.changeContact ---
export interface ClientChangeContactClientInput {
  email?: string;
  phone?: string;
  website?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  countryCode?: string;
}

export const ClientChangeContactCapability = {
  capabilityId: "Client.changeContact",
  entity: "Client",
  command: "changeContact",
  route: "/api/manifest/Client/commands/changeContact",
  instanceCommand: true,
  clientParameterNames: ["email","phone","website","addressLine1","addressLine2","city","region","postalCode","countryCode"],
  serverParameterNames: [],
  emits: ["ClientContactChanged"],
} as const;

/**
 * Build command input for Client.changeContact.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindClientChangeContactInput(client: ClientChangeContactClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Client.changeContact. */
export const ClientChangeContactInvalidation = [
  {
    "kind": "entityList",
    "entity": "Client",
    "queryKeyHint": "queryKeys.client.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Client",
    "queryKeyHint": "queryKeys.client.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Client.reactivate ---
export type ClientReactivateClientInput = Record<string, never>;

export const ClientReactivateCapability = {
  capabilityId: "Client.reactivate",
  entity: "Client",
  command: "reactivate",
  route: "/api/manifest/Client/commands/reactivate",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["ClientReactivated"],
} as const;

/**
 * Build command input for Client.reactivate.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindClientReactivateInput(client: ClientReactivateClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Client.reactivate. */
export const ClientReactivateInvalidation = [
  {
    "kind": "entityList",
    "entity": "Client",
    "queryKeyHint": "queryKeys.client.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Client",
    "queryKeyHint": "queryKeys.client.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Client.reactivate. */
export const ClientReactivateLifecycle = [
  {
    "property": "status",
    "from": "archived",
    "to": "active",
    "proven": true
  }
] as const;

// --- Client.register ---
export interface ClientRegisterClientInput {
  /** Allowed: "company" | "person" */
  clientType: "company" | "person";
  companyName?: string;
  givenName?: string;
  familyName?: string;
  email?: string;
  phone?: string;
  website?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  countryCode?: string;
  taxId?: string;
  taxExempt?: boolean;
  /** Bounds: 0..365 */
  paymentTermsDays?: number;
  notes?: string;
  assignedToId?: string;
}

export const ClientRegisterCapability = {
  capabilityId: "Client.register",
  entity: "Client",
  command: "register",
  route: "/api/manifest/Client/commands/register",
  instanceCommand: true,
  clientParameterNames: ["clientType","companyName","givenName","familyName","email","phone","website","addressLine1","addressLine2","city","region","postalCode","countryCode","taxId","taxExempt","paymentTermsDays","notes","assignedToId"],
  serverParameterNames: [],
  emits: ["ClientRegistered"],
} as const;

/**
 * Build command input for Client.register.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindClientRegisterInput(client: ClientRegisterClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Client.register. */
export const ClientRegisterInvalidation = [
  {
    "kind": "entityList",
    "entity": "Client",
    "queryKeyHint": "queryKeys.client.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Client",
    "queryKeyHint": "queryKeys.client.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- ClientContact.add ---
export interface ClientContactAddClientInput {
  clientId: string;
  givenName: string;
  familyName?: string;
  title?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  isPrimary?: boolean;
  isBillingContact?: boolean;
  notes?: string;
}

export const ClientContactAddCapability = {
  capabilityId: "ClientContact.add",
  entity: "ClientContact",
  command: "add",
  route: "/api/manifest/ClientContact/commands/add",
  instanceCommand: true,
  clientParameterNames: ["clientId","givenName","familyName","title","email","phone","mobile","isPrimary","isBillingContact","notes"],
  serverParameterNames: [],
  emits: ["ClientContactAdded"],
} as const;

/**
 * Build command input for ClientContact.add.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindClientContactAddInput(client: ClientContactAddClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful ClientContact.add. */
export const ClientContactAddInvalidation = [
  {
    "kind": "entityList",
    "entity": "ClientContact",
    "queryKeyHint": "queryKeys.clientContact.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "ClientContact",
    "queryKeyHint": "queryKeys.clientContact.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- ClientContact.remove ---
export type ClientContactRemoveClientInput = Record<string, never>;

export const ClientContactRemoveCapability = {
  capabilityId: "ClientContact.remove",
  entity: "ClientContact",
  command: "remove",
  route: "/api/manifest/ClientContact/commands/remove",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["ClientContactRemoved"],
} as const;

/**
 * Build command input for ClientContact.remove.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindClientContactRemoveInput(client: ClientContactRemoveClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful ClientContact.remove. */
export const ClientContactRemoveInvalidation = [
  {
    "kind": "entityList",
    "entity": "ClientContact",
    "queryKeyHint": "queryKeys.clientContact.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "ClientContact",
    "queryKeyHint": "queryKeys.clientContact.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for ClientContact.remove. */
export const ClientContactRemoveLifecycle = [
  {
    "property": "status",
    "from": "active",
    "to": "removed",
    "proven": true
  }
] as const;

// --- ClientContact.setPrimary ---
export type ClientContactSetPrimaryClientInput = Record<string, never>;

export const ClientContactSetPrimaryCapability = {
  capabilityId: "ClientContact.setPrimary",
  entity: "ClientContact",
  command: "setPrimary",
  route: "/api/manifest/ClientContact/commands/setPrimary",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["ClientContactPrimarySet"],
} as const;

/**
 * Build command input for ClientContact.setPrimary.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindClientContactSetPrimaryInput(client: ClientContactSetPrimaryClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful ClientContact.setPrimary. */
export const ClientContactSetPrimaryInvalidation = [
  {
    "kind": "entityList",
    "entity": "ClientContact",
    "queryKeyHint": "queryKeys.clientContact.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "ClientContact",
    "queryKeyHint": "queryKeys.clientContact.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- ClientContact.updateDetails ---
export interface ClientContactUpdateDetailsClientInput {
  givenName: string;
  familyName?: string;
  title?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  isBillingContact?: boolean;
  notes?: string;
}

export const ClientContactUpdateDetailsCapability = {
  capabilityId: "ClientContact.updateDetails",
  entity: "ClientContact",
  command: "updateDetails",
  route: "/api/manifest/ClientContact/commands/updateDetails",
  instanceCommand: true,
  clientParameterNames: ["givenName","familyName","title","email","phone","mobile","isBillingContact","notes"],
  serverParameterNames: [],
  emits: ["ClientContactDetailsUpdated"],
} as const;

/**
 * Build command input for ClientContact.updateDetails.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindClientContactUpdateDetailsInput(client: ClientContactUpdateDetailsClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful ClientContact.updateDetails. */
export const ClientContactUpdateDetailsInvalidation = [
  {
    "kind": "entityList",
    "entity": "ClientContact",
    "queryKeyHint": "queryKeys.clientContact.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "ClientContact",
    "queryKeyHint": "queryKeys.clientContact.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Contract.draft ---
export interface ContractDraftClientInput {
  eventId: string;
  clientId: string;
  title: string;
  contractNumber?: string;
  documentUrl?: string;
  expiresAt?: string;
  notes?: string;
}

export const ContractDraftCapability = {
  capabilityId: "Contract.draft",
  entity: "Contract",
  command: "draft",
  route: "/api/manifest/Contract/commands/draft",
  instanceCommand: true,
  clientParameterNames: ["eventId","clientId","title","contractNumber","documentUrl","expiresAt","notes"],
  serverParameterNames: [],
  emits: ["ContractDrafted"],
} as const;

/**
 * Build command input for Contract.draft.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindContractDraftInput(client: ContractDraftClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Contract.draft. */
export const ContractDraftInvalidation = [
  {
    "kind": "entityList",
    "entity": "Contract",
    "queryKeyHint": "queryKeys.contract.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Contract",
    "queryKeyHint": "queryKeys.contract.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Contract.expire ---
export type ContractExpireClientInput = Record<string, never>;

export const ContractExpireCapability = {
  capabilityId: "Contract.expire",
  entity: "Contract",
  command: "expire",
  route: "/api/manifest/Contract/commands/expire",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["ContractExpired"],
} as const;

/**
 * Build command input for Contract.expire.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindContractExpireInput(client: ContractExpireClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Contract.expire. */
export const ContractExpireInvalidation = [
  {
    "kind": "entityList",
    "entity": "Contract",
    "queryKeyHint": "queryKeys.contract.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Contract",
    "queryKeyHint": "queryKeys.contract.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Contract.expire. */
export const ContractExpireLifecycle = [
  {
    "property": "status",
    "from": "sent",
    "to": "expired",
    "proven": true
  },
  {
    "property": "status",
    "from": "viewed",
    "to": "expired",
    "proven": true
  }
] as const;

// --- Contract.markViewed ---
export type ContractMarkViewedClientInput = Record<string, never>;

export const ContractMarkViewedCapability = {
  capabilityId: "Contract.markViewed",
  entity: "Contract",
  command: "markViewed",
  route: "/api/manifest/Contract/commands/markViewed",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["ContractViewed"],
} as const;

/**
 * Build command input for Contract.markViewed.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindContractMarkViewedInput(client: ContractMarkViewedClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Contract.markViewed. */
export const ContractMarkViewedInvalidation = [
  {
    "kind": "entityList",
    "entity": "Contract",
    "queryKeyHint": "queryKeys.contract.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Contract",
    "queryKeyHint": "queryKeys.contract.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Contract.markViewed. */
export const ContractMarkViewedLifecycle = [
  {
    "property": "status",
    "from": "sent",
    "to": "viewed",
    "proven": true
  }
] as const;

// --- Contract.markVoided ---
export interface ContractMarkVoidedClientInput {
  reason: string;
}

export const ContractMarkVoidedCapability = {
  capabilityId: "Contract.markVoided",
  entity: "Contract",
  command: "markVoided",
  route: "/api/manifest/Contract/commands/markVoided",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["ContractVoided"],
} as const;

/**
 * Build command input for Contract.markVoided.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindContractMarkVoidedInput(client: ContractMarkVoidedClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Contract.markVoided. */
export const ContractMarkVoidedInvalidation = [
  {
    "kind": "entityList",
    "entity": "Contract",
    "queryKeyHint": "queryKeys.contract.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Contract",
    "queryKeyHint": "queryKeys.contract.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Contract.markVoided. */
export const ContractMarkVoidedLifecycle = [
  {
    "property": "status",
    "from": "sent",
    "to": "voided",
    "proven": true
  },
  {
    "property": "status",
    "from": "viewed",
    "to": "voided",
    "proven": true
  }
] as const;

// --- Contract.send ---
export type ContractSendClientInput = Record<string, never>;

export const ContractSendCapability = {
  capabilityId: "Contract.send",
  entity: "Contract",
  command: "send",
  route: "/api/manifest/Contract/commands/send",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["ContractSent"],
} as const;

/**
 * Build command input for Contract.send.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindContractSendInput(client: ContractSendClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Contract.send. */
export const ContractSendInvalidation = [
  {
    "kind": "entityList",
    "entity": "Contract",
    "queryKeyHint": "queryKeys.contract.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Contract",
    "queryKeyHint": "queryKeys.contract.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Contract.send. */
export const ContractSendLifecycle = [
  {
    "property": "status",
    "from": "draft",
    "to": "sent",
    "proven": true
  }
] as const;

// --- Contract.sign ---
export interface ContractSignClientInput {
  signedBy: string;
}

export const ContractSignCapability = {
  capabilityId: "Contract.sign",
  entity: "Contract",
  command: "sign",
  route: "/api/manifest/Contract/commands/sign",
  instanceCommand: true,
  clientParameterNames: ["signedBy"],
  serverParameterNames: [],
  emits: ["ContractSigned"],
} as const;

/**
 * Build command input for Contract.sign.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindContractSignInput(client: ContractSignClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Contract.sign. */
export const ContractSignInvalidation = [
  {
    "kind": "entityList",
    "entity": "Contract",
    "queryKeyHint": "queryKeys.contract.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Contract",
    "queryKeyHint": "queryKeys.contract.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Contract.sign. */
export const ContractSignLifecycle = [
  {
    "property": "status",
    "from": "viewed",
    "to": "signed",
    "proven": true
  }
] as const;

// --- Delivery.cancel ---
export interface DeliveryCancelClientInput {
  reason: string;
}

export const DeliveryCancelCapability = {
  capabilityId: "Delivery.cancel",
  entity: "Delivery",
  command: "cancel",
  route: "/api/manifest/Delivery/commands/cancel",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["DeliveryCancelled"],
} as const;

/**
 * Build command input for Delivery.cancel.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindDeliveryCancelInput(client: DeliveryCancelClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Delivery.cancel. */
export const DeliveryCancelInvalidation = [
  {
    "kind": "entityList",
    "entity": "Delivery",
    "queryKeyHint": "queryKeys.delivery.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Delivery",
    "queryKeyHint": "queryKeys.delivery.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Delivery.cancel. */
export const DeliveryCancelLifecycle = [
  {
    "property": "status",
    "from": "scheduled",
    "to": "cancelled",
    "proven": true
  },
  {
    "property": "status",
    "from": "in_transit",
    "to": "cancelled",
    "proven": true
  }
] as const;

// --- Delivery.confirmDelivery ---
export type DeliveryConfirmDeliveryClientInput = Record<string, never>;

export const DeliveryConfirmDeliveryCapability = {
  capabilityId: "Delivery.confirmDelivery",
  entity: "Delivery",
  command: "confirmDelivery",
  route: "/api/manifest/Delivery/commands/confirmDelivery",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["DeliveryConfirmed"],
} as const;

/**
 * Build command input for Delivery.confirmDelivery.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindDeliveryConfirmDeliveryInput(client: DeliveryConfirmDeliveryClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Delivery.confirmDelivery. */
export const DeliveryConfirmDeliveryInvalidation = [
  {
    "kind": "entityList",
    "entity": "Delivery",
    "queryKeyHint": "queryKeys.delivery.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Delivery",
    "queryKeyHint": "queryKeys.delivery.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Delivery.confirmDelivery. */
export const DeliveryConfirmDeliveryLifecycle = [
  {
    "property": "status",
    "from": "in_transit",
    "to": "delivered",
    "proven": true
  }
] as const;

// --- Delivery.markFailed ---
export interface DeliveryMarkFailedClientInput {
  reason: string;
}

export const DeliveryMarkFailedCapability = {
  capabilityId: "Delivery.markFailed",
  entity: "Delivery",
  command: "markFailed",
  route: "/api/manifest/Delivery/commands/markFailed",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["DeliveryFailed"],
} as const;

/**
 * Build command input for Delivery.markFailed.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindDeliveryMarkFailedInput(client: DeliveryMarkFailedClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Delivery.markFailed. */
export const DeliveryMarkFailedInvalidation = [
  {
    "kind": "entityList",
    "entity": "Delivery",
    "queryKeyHint": "queryKeys.delivery.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Delivery",
    "queryKeyHint": "queryKeys.delivery.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Delivery.markFailed. */
export const DeliveryMarkFailedLifecycle = [
  {
    "property": "status",
    "from": "scheduled",
    "to": "failed",
    "proven": true
  },
  {
    "property": "status",
    "from": "in_transit",
    "to": "failed",
    "proven": true
  }
] as const;

// --- Delivery.schedule ---
export interface DeliveryScheduleClientInput {
  packListId: string;
  eventId: string;
  destination: string;
  /** Must not be "". */
  windowStartsAt: string & { readonly __nonEmpty?: true };
  /** Must not be "". */
  windowEndsAt: string & { readonly __nonEmpty?: true };
  driverId?: string;
  notes?: string;
}

export const DeliveryScheduleCapability = {
  capabilityId: "Delivery.schedule",
  entity: "Delivery",
  command: "schedule",
  route: "/api/manifest/Delivery/commands/schedule",
  instanceCommand: true,
  clientParameterNames: ["packListId","eventId","destination","windowStartsAt","windowEndsAt","driverId","notes"],
  serverParameterNames: [],
  emits: ["DeliveryScheduled"],
} as const;

/**
 * Build command input for Delivery.schedule.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindDeliveryScheduleInput(client: DeliveryScheduleClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Delivery.schedule. */
export const DeliveryScheduleInvalidation = [
  {
    "kind": "entityList",
    "entity": "Delivery",
    "queryKeyHint": "queryKeys.delivery.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Delivery",
    "queryKeyHint": "queryKeys.delivery.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Delivery.startTransit ---
export type DeliveryStartTransitClientInput = Record<string, never>;

export const DeliveryStartTransitCapability = {
  capabilityId: "Delivery.startTransit",
  entity: "Delivery",
  command: "startTransit",
  route: "/api/manifest/Delivery/commands/startTransit",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["DeliveryTransitStarted"],
} as const;

/**
 * Build command input for Delivery.startTransit.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindDeliveryStartTransitInput(client: DeliveryStartTransitClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Delivery.startTransit. */
export const DeliveryStartTransitInvalidation = [
  {
    "kind": "entityList",
    "entity": "Delivery",
    "queryKeyHint": "queryKeys.delivery.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Delivery",
    "queryKeyHint": "queryKeys.delivery.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Delivery.startTransit. */
export const DeliveryStartTransitLifecycle = [
  {
    "property": "status",
    "from": "scheduled",
    "to": "in_transit",
    "proven": true
  }
] as const;

// --- Dish.introduce ---
export interface DishIntroduceClientInput {
  name: string;
  /** Bounds: 1..∞ */
  portionSize: number;
  /** Allowed: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion" */
  portionUnit: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion";
  description?: string;
  category?: string;
  course?: string;
  serviceStyle?: string;
  dietaryTags?: string[];
}

export const DishIntroduceCapability = {
  capabilityId: "Dish.introduce",
  entity: "Dish",
  command: "introduce",
  route: "/api/manifest/Dish/commands/introduce",
  instanceCommand: true,
  clientParameterNames: ["name","portionSize","portionUnit","description","category","course","serviceStyle","dietaryTags"],
  serverParameterNames: [],
  emits: ["DishIntroduced"],
} as const;

/**
 * Build command input for Dish.introduce.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindDishIntroduceInput(client: DishIntroduceClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Dish.introduce. */
export const DishIntroduceInvalidation = [
  {
    "kind": "entityList",
    "entity": "Dish",
    "queryKeyHint": "queryKeys.dish.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Dish",
    "queryKeyHint": "queryKeys.dish.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Dish.reinstate ---
export type DishReinstateClientInput = Record<string, never>;

export const DishReinstateCapability = {
  capabilityId: "Dish.reinstate",
  entity: "Dish",
  command: "reinstate",
  route: "/api/manifest/Dish/commands/reinstate",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["DishReinstated"],
} as const;

/**
 * Build command input for Dish.reinstate.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindDishReinstateInput(client: DishReinstateClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Dish.reinstate. */
export const DishReinstateInvalidation = [
  {
    "kind": "entityList",
    "entity": "Dish",
    "queryKeyHint": "queryKeys.dish.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Dish",
    "queryKeyHint": "queryKeys.dish.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Dish.reinstate. */
export const DishReinstateLifecycle = [
  {
    "property": "status",
    "from": "retired",
    "to": "active",
    "proven": true
  }
] as const;

// --- Dish.retire ---
export interface DishRetireClientInput {
  reason: string;
}

export const DishRetireCapability = {
  capabilityId: "Dish.retire",
  entity: "Dish",
  command: "retire",
  route: "/api/manifest/Dish/commands/retire",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["DishRetired"],
} as const;

/**
 * Build command input for Dish.retire.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindDishRetireInput(client: DishRetireClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Dish.retire. */
export const DishRetireInvalidation = [
  {
    "kind": "entityList",
    "entity": "Dish",
    "queryKeyHint": "queryKeys.dish.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Dish",
    "queryKeyHint": "queryKeys.dish.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Dish.retire. */
export const DishRetireLifecycle = [
  {
    "property": "status",
    "from": "active",
    "to": "retired",
    "proven": true
  }
] as const;

// --- Dish.reviseDetails ---
export interface DishReviseDetailsClientInput {
  name: string;
  description?: string;
  category?: string;
  course?: string;
  serviceStyle?: string;
  dietaryTags?: string[];
}

export const DishReviseDetailsCapability = {
  capabilityId: "Dish.reviseDetails",
  entity: "Dish",
  command: "reviseDetails",
  route: "/api/manifest/Dish/commands/reviseDetails",
  instanceCommand: true,
  clientParameterNames: ["name","description","category","course","serviceStyle","dietaryTags"],
  serverParameterNames: [],
  emits: ["DishDetailsRevised"],
} as const;

/**
 * Build command input for Dish.reviseDetails.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindDishReviseDetailsInput(client: DishReviseDetailsClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Dish.reviseDetails. */
export const DishReviseDetailsInvalidation = [
  {
    "kind": "entityList",
    "entity": "Dish",
    "queryKeyHint": "queryKeys.dish.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Dish",
    "queryKeyHint": "queryKeys.dish.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Dish.updatePortioning ---
export interface DishUpdatePortioningClientInput {
  /** Bounds: 1..∞ */
  portionSize: number;
  /** Allowed: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion" */
  portionUnit: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion";
}

export const DishUpdatePortioningCapability = {
  capabilityId: "Dish.updatePortioning",
  entity: "Dish",
  command: "updatePortioning",
  route: "/api/manifest/Dish/commands/updatePortioning",
  instanceCommand: true,
  clientParameterNames: ["portionSize","portionUnit"],
  serverParameterNames: [],
  emits: ["DishPortioningUpdated"],
} as const;

/**
 * Build command input for Dish.updatePortioning.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindDishUpdatePortioningInput(client: DishUpdatePortioningClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Dish.updatePortioning. */
export const DishUpdatePortioningInvalidation = [
  {
    "kind": "entityList",
    "entity": "Dish",
    "queryKeyHint": "queryKeys.dish.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Dish",
    "queryKeyHint": "queryKeys.dish.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- DishRecipe.attach ---
export interface DishRecipeAttachClientInput {
  dishId: string;
  recipeId: string;
  sortOrder?: number;
  role?: string;
}

export const DishRecipeAttachCapability = {
  capabilityId: "DishRecipe.attach",
  entity: "DishRecipe",
  command: "attach",
  route: "/api/manifest/DishRecipe/commands/attach",
  instanceCommand: true,
  clientParameterNames: ["dishId","recipeId","sortOrder","role"],
  serverParameterNames: [],
  emits: ["DishRecipeAttached"],
} as const;

/**
 * Build command input for DishRecipe.attach.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindDishRecipeAttachInput(client: DishRecipeAttachClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful DishRecipe.attach. */
export const DishRecipeAttachInvalidation = [
  {
    "kind": "entityList",
    "entity": "DishRecipe",
    "queryKeyHint": "queryKeys.dishRecipe.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "DishRecipe",
    "queryKeyHint": "queryKeys.dishRecipe.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- DishRecipe.detach ---
export interface DishRecipeDetachClientInput {
  reason: string;
}

export const DishRecipeDetachCapability = {
  capabilityId: "DishRecipe.detach",
  entity: "DishRecipe",
  command: "detach",
  route: "/api/manifest/DishRecipe/commands/detach",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["DishRecipeDetached"],
} as const;

/**
 * Build command input for DishRecipe.detach.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindDishRecipeDetachInput(client: DishRecipeDetachClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful DishRecipe.detach. */
export const DishRecipeDetachInvalidation = [
  {
    "kind": "entityList",
    "entity": "DishRecipe",
    "queryKeyHint": "queryKeys.dishRecipe.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "DishRecipe",
    "queryKeyHint": "queryKeys.dishRecipe.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- DishTask.add ---
export interface DishTaskAddClientInput {
  dishId: string;
  name: string;
  category?: string;
  taskType?: string;
  /** Bounds: 1..∞ */
  defaultQuantity?: number;
  /** Allowed: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion" */
  defaultUnit?: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion";
  /** Bounds: 0..∞ */
  sortOrder?: number;
  recipeId?: string;
  ingredientId?: string;
  instructions?: string;
}

export const DishTaskAddCapability = {
  capabilityId: "DishTask.add",
  entity: "DishTask",
  command: "add",
  route: "/api/manifest/DishTask/commands/add",
  instanceCommand: true,
  clientParameterNames: ["dishId","name","category","taskType","defaultQuantity","defaultUnit","sortOrder","recipeId","ingredientId","instructions"],
  serverParameterNames: [],
  emits: ["DishTaskAdded"],
} as const;

/**
 * Build command input for DishTask.add.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindDishTaskAddInput(client: DishTaskAddClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful DishTask.add. */
export const DishTaskAddInvalidation = [
  {
    "kind": "entityList",
    "entity": "DishTask",
    "queryKeyHint": "queryKeys.dishTask.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "DishTask",
    "queryKeyHint": "queryKeys.dishTask.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- DishTask.retire ---
export interface DishTaskRetireClientInput {
  reason: string;
}

export const DishTaskRetireCapability = {
  capabilityId: "DishTask.retire",
  entity: "DishTask",
  command: "retire",
  route: "/api/manifest/DishTask/commands/retire",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["DishTaskRetired"],
} as const;

/**
 * Build command input for DishTask.retire.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindDishTaskRetireInput(client: DishTaskRetireClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful DishTask.retire. */
export const DishTaskRetireInvalidation = [
  {
    "kind": "entityList",
    "entity": "DishTask",
    "queryKeyHint": "queryKeys.dishTask.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "DishTask",
    "queryKeyHint": "queryKeys.dishTask.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for DishTask.retire. */
export const DishTaskRetireLifecycle = [
  {
    "property": "status",
    "from": "active",
    "to": "retired",
    "proven": true
  }
] as const;

// --- DishTask.revise ---
export interface DishTaskReviseClientInput {
  name: string;
  category?: string;
  taskType?: string;
  /** Bounds: 1..∞ */
  defaultQuantity?: number;
  /** Allowed: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion" */
  defaultUnit?: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion";
  /** Bounds: 0..∞ */
  sortOrder?: number;
  recipeId?: string;
  ingredientId?: string;
  instructions?: string;
}

export const DishTaskReviseCapability = {
  capabilityId: "DishTask.revise",
  entity: "DishTask",
  command: "revise",
  route: "/api/manifest/DishTask/commands/revise",
  instanceCommand: true,
  clientParameterNames: ["name","category","taskType","defaultQuantity","defaultUnit","sortOrder","recipeId","ingredientId","instructions"],
  serverParameterNames: [],
  emits: ["DishTaskRevised"],
} as const;

/**
 * Build command input for DishTask.revise.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindDishTaskReviseInput(client: DishTaskReviseClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful DishTask.revise. */
export const DishTaskReviseInvalidation = [
  {
    "kind": "entityList",
    "entity": "DishTask",
    "queryKeyHint": "queryKeys.dishTask.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "DishTask",
    "queryKeyHint": "queryKeys.dishTask.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Event.approve ---
export type EventApproveClientInput = Record<string, never>;

export const EventApproveCapability = {
  capabilityId: "Event.approve",
  entity: "Event",
  command: "approve",
  route: "/api/manifest/Event/commands/approve",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["EventApproved"],
} as const;

/**
 * Build command input for Event.approve.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventApproveInput(client: EventApproveClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Event.approve. */
export const EventApproveInvalidation = [
  {
    "kind": "entityList",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Event.approve. */
export const EventApproveLifecycle = [
  {
    "property": "stage",
    "from": "pending_approval",
    "to": "approved",
    "proven": true
  }
] as const;

// --- Event.assignOwner ---
export interface EventAssignOwnerClientInput {
  assignedToId?: string;
}

export const EventAssignOwnerCapability = {
  capabilityId: "Event.assignOwner",
  entity: "Event",
  command: "assignOwner",
  route: "/api/manifest/Event/commands/assignOwner",
  instanceCommand: true,
  clientParameterNames: ["assignedToId"],
  serverParameterNames: [],
  emits: ["EventOwnerAssigned"],
} as const;

/**
 * Build command input for Event.assignOwner.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventAssignOwnerInput(client: EventAssignOwnerClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Event.assignOwner. */
export const EventAssignOwnerInvalidation = [
  {
    "kind": "entityList",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Event.beginExecution ---
export type EventBeginExecutionClientInput = Record<string, never>;

export const EventBeginExecutionCapability = {
  capabilityId: "Event.beginExecution",
  entity: "Event",
  command: "beginExecution",
  route: "/api/manifest/Event/commands/beginExecution",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["EventExecutionStarted"],
} as const;

/**
 * Build command input for Event.beginExecution.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventBeginExecutionInput(client: EventBeginExecutionClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Event.beginExecution. */
export const EventBeginExecutionInvalidation = [
  {
    "kind": "entityList",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Event.beginExecution. */
export const EventBeginExecutionLifecycle = [
  {
    "property": "stage",
    "from": "approved",
    "to": "executing",
    "proven": true
  }
] as const;

// --- Event.cancel ---
export interface EventCancelClientInput {
  reason: string;
}

export const EventCancelCapability = {
  capabilityId: "Event.cancel",
  entity: "Event",
  command: "cancel",
  route: "/api/manifest/Event/commands/cancel",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["EventCancelled"],
} as const;

/**
 * Build command input for Event.cancel.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventCancelInput(client: EventCancelClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Event.cancel. */
export const EventCancelInvalidation = [
  {
    "kind": "entityList",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Event.cancel. */
export const EventCancelLifecycle = [
  {
    "property": "stage",
    "from": "planning",
    "to": "cancelled",
    "proven": true
  },
  {
    "property": "stage",
    "from": "pending_approval",
    "to": "cancelled",
    "proven": true
  },
  {
    "property": "stage",
    "from": "approved",
    "to": "cancelled",
    "proven": true
  },
  {
    "property": "stage",
    "from": "executing",
    "to": "cancelled",
    "proven": true
  }
] as const;

// --- Event.changeHeadcount ---
export interface EventChangeHeadcountClientInput {
  /** Bounds: 1..100000 */
  newHeadcount: number;
}

export const EventChangeHeadcountCapability = {
  capabilityId: "Event.changeHeadcount",
  entity: "Event",
  command: "changeHeadcount",
  route: "/api/manifest/Event/commands/changeHeadcount",
  instanceCommand: true,
  clientParameterNames: ["newHeadcount"],
  serverParameterNames: [],
  emits: ["EventHeadcountChanged"],
} as const;

/**
 * Build command input for Event.changeHeadcount.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventChangeHeadcountInput(client: EventChangeHeadcountClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Event.changeHeadcount. */
export const EventChangeHeadcountInvalidation = [
  {
    "kind": "entityList",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Event.changePricing ---
export interface EventChangePricingClientInput {
  /** Bounds: 0..∞ */
  budgetAmount: number;
  /** Bounds: 0..∞ */
  quotedPrice: number;
}

export const EventChangePricingCapability = {
  capabilityId: "Event.changePricing",
  entity: "Event",
  command: "changePricing",
  route: "/api/manifest/Event/commands/changePricing",
  instanceCommand: true,
  clientParameterNames: ["budgetAmount","quotedPrice"],
  serverParameterNames: [],
  emits: ["EventPricingChanged"],
} as const;

/**
 * Build command input for Event.changePricing.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventChangePricingInput(client: EventChangePricingClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Event.changePricing. */
export const EventChangePricingInvalidation = [
  {
    "kind": "entityList",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Event.changePrimaryContact ---
export interface EventChangePrimaryContactClientInput {
  primaryContactName: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
}

export const EventChangePrimaryContactCapability = {
  capabilityId: "Event.changePrimaryContact",
  entity: "Event",
  command: "changePrimaryContact",
  route: "/api/manifest/Event/commands/changePrimaryContact",
  instanceCommand: true,
  clientParameterNames: ["primaryContactName","primaryContactEmail","primaryContactPhone"],
  serverParameterNames: [],
  emits: ["EventPrimaryContactChanged"],
} as const;

/**
 * Build command input for Event.changePrimaryContact.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventChangePrimaryContactInput(client: EventChangePrimaryContactClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Event.changePrimaryContact. */
export const EventChangePrimaryContactInvalidation = [
  {
    "kind": "entityList",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Event.changeRequirements ---
export interface EventChangeRequirementsClientInput {
  accessibilityNeeds?: string[];
  serviceRequirements?: string;
  operationalRequirements?: string;
}

export const EventChangeRequirementsCapability = {
  capabilityId: "Event.changeRequirements",
  entity: "Event",
  command: "changeRequirements",
  route: "/api/manifest/Event/commands/changeRequirements",
  instanceCommand: true,
  clientParameterNames: ["accessibilityNeeds","serviceRequirements","operationalRequirements"],
  serverParameterNames: [],
  emits: ["EventRequirementsChanged"],
} as const;

/**
 * Build command input for Event.changeRequirements.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventChangeRequirementsInput(client: EventChangeRequirementsClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Event.changeRequirements. */
export const EventChangeRequirementsInvalidation = [
  {
    "kind": "entityList",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Event.changeVenue ---
export interface EventChangeVenueClientInput {
  venueId?: string;
  venueName?: string;
  venueAddress?: string;
}

export const EventChangeVenueCapability = {
  capabilityId: "Event.changeVenue",
  entity: "Event",
  command: "changeVenue",
  route: "/api/manifest/Event/commands/changeVenue",
  instanceCommand: true,
  clientParameterNames: ["venueId","venueName","venueAddress"],
  serverParameterNames: [],
  emits: ["EventVenueChanged"],
} as const;

/**
 * Build command input for Event.changeVenue.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventChangeVenueInput(client: EventChangeVenueClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Event.changeVenue. */
export const EventChangeVenueInvalidation = [
  {
    "kind": "entityList",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Event.closeOut ---
export type EventCloseOutClientInput = Record<string, never>;

export const EventCloseOutCapability = {
  capabilityId: "Event.closeOut",
  entity: "Event",
  command: "closeOut",
  route: "/api/manifest/Event/commands/closeOut",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["EventClosedOut"],
} as const;

/**
 * Build command input for Event.closeOut.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventCloseOutInput(client: EventCloseOutClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Event.closeOut. */
export const EventCloseOutInvalidation = [
  {
    "kind": "entityList",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Event.closeOut. */
export const EventCloseOutLifecycle = [
  {
    "property": "stage",
    "from": "completed",
    "to": "closed_out",
    "proven": true
  }
] as const;

// --- Event.complete ---
export type EventCompleteClientInput = Record<string, never>;

export const EventCompleteCapability = {
  capabilityId: "Event.complete",
  entity: "Event",
  command: "complete",
  route: "/api/manifest/Event/commands/complete",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["EventCompleted"],
} as const;

/**
 * Build command input for Event.complete.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventCompleteInput(client: EventCompleteClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Event.complete. */
export const EventCompleteInvalidation = [
  {
    "kind": "entityList",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Event.complete. */
export const EventCompleteLifecycle = [
  {
    "property": "stage",
    "from": "executing",
    "to": "completed",
    "proven": true
  }
] as const;

// --- Event.planEngagement ---
export interface EventPlanEngagementClientInput {
  clientId: string;
  title: string;
  eventType: string;
  /** Must not be "". */
  startsAt: string & { readonly __nonEmpty?: true };
  /** Must not be "". */
  endsAt: string & { readonly __nonEmpty?: true };
  /** Bounds: 1..100000 */
  expectedHeadcount: number;
  primaryContactName: string;
  /** Bounds: 0..∞ */
  budgetAmount: number;
  /** Bounds: 0..∞ */
  quotedPrice: number;
  venueId?: string;
  venueName?: string;
  venueAddress?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  accessibilityNeeds?: string[];
  serviceRequirements?: string;
  operationalRequirements?: string;
  assignedToId?: string;
}

export const EventPlanEngagementCapability = {
  capabilityId: "Event.planEngagement",
  entity: "Event",
  command: "planEngagement",
  route: "/api/manifest/Event/commands/planEngagement",
  instanceCommand: true,
  clientParameterNames: ["clientId","title","eventType","startsAt","endsAt","expectedHeadcount","primaryContactName","budgetAmount","quotedPrice","venueId","venueName","venueAddress","primaryContactEmail","primaryContactPhone","accessibilityNeeds","serviceRequirements","operationalRequirements","assignedToId"],
  serverParameterNames: [],
  emits: ["EventPlanned"],
} as const;

/**
 * Build command input for Event.planEngagement.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventPlanEngagementInput(client: EventPlanEngagementClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Event.planEngagement. */
export const EventPlanEngagementInvalidation = [
  {
    "kind": "entityList",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Event.reschedule ---
export interface EventRescheduleClientInput {
  /** Must not be "". */
  startsAt: string & { readonly __nonEmpty?: true };
  /** Must not be "". */
  endsAt: string & { readonly __nonEmpty?: true };
}

export const EventRescheduleCapability = {
  capabilityId: "Event.reschedule",
  entity: "Event",
  command: "reschedule",
  route: "/api/manifest/Event/commands/reschedule",
  instanceCommand: true,
  clientParameterNames: ["startsAt","endsAt"],
  serverParameterNames: [],
  emits: ["EventScheduleChanged"],
} as const;

/**
 * Build command input for Event.reschedule.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventRescheduleInput(client: EventRescheduleClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Event.reschedule. */
export const EventRescheduleInvalidation = [
  {
    "kind": "entityList",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Event.returnToPlanning ---
export interface EventReturnToPlanningClientInput {
  reason: string;
}

export const EventReturnToPlanningCapability = {
  capabilityId: "Event.returnToPlanning",
  entity: "Event",
  command: "returnToPlanning",
  route: "/api/manifest/Event/commands/returnToPlanning",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["EventReturnedToPlanning"],
} as const;

/**
 * Build command input for Event.returnToPlanning.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventReturnToPlanningInput(client: EventReturnToPlanningClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Event.returnToPlanning. */
export const EventReturnToPlanningInvalidation = [
  {
    "kind": "entityList",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Event.returnToPlanning. */
export const EventReturnToPlanningLifecycle = [
  {
    "property": "stage",
    "from": "pending_approval",
    "to": "planning",
    "proven": true
  },
  {
    "property": "stage",
    "from": "approved",
    "to": "planning",
    "proven": true
  }
] as const;

// --- Event.submitForApproval ---
export type EventSubmitForApprovalClientInput = Record<string, never>;

export const EventSubmitForApprovalCapability = {
  capabilityId: "Event.submitForApproval",
  entity: "Event",
  command: "submitForApproval",
  route: "/api/manifest/Event/commands/submitForApproval",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["EventSubmittedForApproval"],
} as const;

/**
 * Build command input for Event.submitForApproval.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventSubmitForApprovalInput(client: EventSubmitForApprovalClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Event.submitForApproval. */
export const EventSubmitForApprovalInvalidation = [
  {
    "kind": "entityList",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Event",
    "queryKeyHint": "queryKeys.event.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Event.submitForApproval. */
export const EventSubmitForApprovalLifecycle = [
  {
    "property": "stage",
    "from": "planning",
    "to": "pending_approval",
    "proven": true
  }
] as const;

// --- EventAllergenCheck.record ---
export interface EventAllergenCheckRecordClientInput {
  eventId: string;
  /** Allowed: "pass" | "flagged" */
  result: "pass" | "flagged";
  eventDishId?: string;
  dishId?: string;
  /** Non-empty string required (static). */
  flaggedAllergens?: ("milk" | "eggs" | "fish" | "crustacean_shellfish" | "tree_nuts" | "peanuts" | "wheat" | "soybeans" | "sesame")[];
  notes?: string;
}

export const EventAllergenCheckRecordCapability = {
  capabilityId: "EventAllergenCheck.record",
  entity: "EventAllergenCheck",
  command: "record",
  route: "/api/manifest/EventAllergenCheck/commands/record",
  instanceCommand: true,
  clientParameterNames: ["eventId","result","eventDishId","dishId","flaggedAllergens","notes"],
  serverParameterNames: [],
  emits: ["EventAllergenCheckRecorded"],
} as const;

/**
 * Build command input for EventAllergenCheck.record.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventAllergenCheckRecordInput(client: EventAllergenCheckRecordClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful EventAllergenCheck.record. */
export const EventAllergenCheckRecordInvalidation = [
  {
    "kind": "entityList",
    "entity": "EventAllergenCheck",
    "queryKeyHint": "queryKeys.eventAllergenCheck.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "EventAllergenCheck",
    "queryKeyHint": "queryKeys.eventAllergenCheck.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for EventAllergenCheck.record. */
export const EventAllergenCheckRecordLifecycle = [
  {
    "property": "status",
    "from": "pending",
    "to": "recorded",
    "proven": true
  }
] as const;

// --- EventAssignment.assign ---
export interface EventAssignmentAssignClientInput {
  eventId: string;
  personId: string;
  role: string;
  startsAt?: string;
  endsAt?: string;
  notes?: string;
}

export const EventAssignmentAssignCapability = {
  capabilityId: "EventAssignment.assign",
  entity: "EventAssignment",
  command: "assign",
  route: "/api/manifest/EventAssignment/commands/assign",
  instanceCommand: true,
  clientParameterNames: ["eventId","personId","role","startsAt","endsAt","notes"],
  serverParameterNames: [],
  emits: ["EventAssignmentAssigned"],
} as const;

/**
 * Build command input for EventAssignment.assign.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventAssignmentAssignInput(client: EventAssignmentAssignClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful EventAssignment.assign. */
export const EventAssignmentAssignInvalidation = [
  {
    "kind": "entityList",
    "entity": "EventAssignment",
    "queryKeyHint": "queryKeys.eventAssignment.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "EventAssignment",
    "queryKeyHint": "queryKeys.eventAssignment.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- EventAssignment.checkIn ---
export type EventAssignmentCheckInClientInput = Record<string, never>;

export const EventAssignmentCheckInCapability = {
  capabilityId: "EventAssignment.checkIn",
  entity: "EventAssignment",
  command: "checkIn",
  route: "/api/manifest/EventAssignment/commands/checkIn",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["EventAssignmentCheckedIn"],
} as const;

/**
 * Build command input for EventAssignment.checkIn.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventAssignmentCheckInInput(client: EventAssignmentCheckInClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful EventAssignment.checkIn. */
export const EventAssignmentCheckInInvalidation = [
  {
    "kind": "entityList",
    "entity": "EventAssignment",
    "queryKeyHint": "queryKeys.eventAssignment.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "EventAssignment",
    "queryKeyHint": "queryKeys.eventAssignment.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for EventAssignment.checkIn. */
export const EventAssignmentCheckInLifecycle = [
  {
    "property": "status",
    "from": "assigned",
    "to": "checked_in",
    "proven": true
  },
  {
    "property": "status",
    "from": "confirmed",
    "to": "checked_in",
    "proven": true
  }
] as const;

// --- EventAssignment.checkOut ---
export type EventAssignmentCheckOutClientInput = Record<string, never>;

export const EventAssignmentCheckOutCapability = {
  capabilityId: "EventAssignment.checkOut",
  entity: "EventAssignment",
  command: "checkOut",
  route: "/api/manifest/EventAssignment/commands/checkOut",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["EventAssignmentCheckedOut"],
} as const;

/**
 * Build command input for EventAssignment.checkOut.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventAssignmentCheckOutInput(client: EventAssignmentCheckOutClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful EventAssignment.checkOut. */
export const EventAssignmentCheckOutInvalidation = [
  {
    "kind": "entityList",
    "entity": "EventAssignment",
    "queryKeyHint": "queryKeys.eventAssignment.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "EventAssignment",
    "queryKeyHint": "queryKeys.eventAssignment.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for EventAssignment.checkOut. */
export const EventAssignmentCheckOutLifecycle = [
  {
    "property": "status",
    "from": "checked_in",
    "to": "checked_out",
    "proven": true
  }
] as const;

// --- EventAssignment.confirm ---
export type EventAssignmentConfirmClientInput = Record<string, never>;

export const EventAssignmentConfirmCapability = {
  capabilityId: "EventAssignment.confirm",
  entity: "EventAssignment",
  command: "confirm",
  route: "/api/manifest/EventAssignment/commands/confirm",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["EventAssignmentConfirmed"],
} as const;

/**
 * Build command input for EventAssignment.confirm.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventAssignmentConfirmInput(client: EventAssignmentConfirmClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful EventAssignment.confirm. */
export const EventAssignmentConfirmInvalidation = [
  {
    "kind": "entityList",
    "entity": "EventAssignment",
    "queryKeyHint": "queryKeys.eventAssignment.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "EventAssignment",
    "queryKeyHint": "queryKeys.eventAssignment.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for EventAssignment.confirm. */
export const EventAssignmentConfirmLifecycle = [
  {
    "property": "status",
    "from": "assigned",
    "to": "confirmed",
    "proven": true
  }
] as const;

// --- EventAssignment.markNoShow ---
export type EventAssignmentMarkNoShowClientInput = Record<string, never>;

export const EventAssignmentMarkNoShowCapability = {
  capabilityId: "EventAssignment.markNoShow",
  entity: "EventAssignment",
  command: "markNoShow",
  route: "/api/manifest/EventAssignment/commands/markNoShow",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["EventAssignmentNoShowMarked"],
} as const;

/**
 * Build command input for EventAssignment.markNoShow.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventAssignmentMarkNoShowInput(client: EventAssignmentMarkNoShowClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful EventAssignment.markNoShow. */
export const EventAssignmentMarkNoShowInvalidation = [
  {
    "kind": "entityList",
    "entity": "EventAssignment",
    "queryKeyHint": "queryKeys.eventAssignment.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "EventAssignment",
    "queryKeyHint": "queryKeys.eventAssignment.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for EventAssignment.markNoShow. */
export const EventAssignmentMarkNoShowLifecycle = [
  {
    "property": "status",
    "from": "assigned",
    "to": "no_show",
    "proven": true
  },
  {
    "property": "status",
    "from": "confirmed",
    "to": "no_show",
    "proven": true
  }
] as const;

// --- EventAssignment.unassign ---
export type EventAssignmentUnassignClientInput = Record<string, never>;

export const EventAssignmentUnassignCapability = {
  capabilityId: "EventAssignment.unassign",
  entity: "EventAssignment",
  command: "unassign",
  route: "/api/manifest/EventAssignment/commands/unassign",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["EventAssignmentUnassigned"],
} as const;

/**
 * Build command input for EventAssignment.unassign.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventAssignmentUnassignInput(client: EventAssignmentUnassignClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful EventAssignment.unassign. */
export const EventAssignmentUnassignInvalidation = [
  {
    "kind": "entityList",
    "entity": "EventAssignment",
    "queryKeyHint": "queryKeys.eventAssignment.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "EventAssignment",
    "queryKeyHint": "queryKeys.eventAssignment.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for EventAssignment.unassign. */
export const EventAssignmentUnassignLifecycle = [
  {
    "property": "status",
    "from": "assigned",
    "to": "unassigned",
    "proven": true
  },
  {
    "property": "status",
    "from": "confirmed",
    "to": "unassigned",
    "proven": true
  }
] as const;

// --- EventCloseout.capture ---
export interface EventCloseoutCaptureClientInput {
  eventId: string;
  /** Bounds: 0..∞ */
  actualRevenue: number;
  /** Bounds: 0..∞ */
  budgetedRevenue: number;
  revenueVariance: number;
  /** Bounds: 0..∞ */
  actualIngredientCost: number;
  /** Bounds: 0..∞ */
  actualWasteCost: number;
  /** Bounds: 0..∞ */
  actualLaborCost: number;
  /** Bounds: 0..∞ */
  actualVendorCost: number;
  /** Bounds: 0..∞ */
  budgetedCost: number;
  /** Bounds: 0..∞ */
  totalActualCost: number;
  costVariance: number;
  grossProfit: number;
  /** Bounds: 0..∞ */
  expectedHeadcount: number;
  /** Bounds: 0..∞ */
  actualHeadcount: number;
  unresolvedIssues?: string;
  performanceNotes?: string;
  notes?: string;
}

export const EventCloseoutCaptureCapability = {
  capabilityId: "EventCloseout.capture",
  entity: "EventCloseout",
  command: "capture",
  route: "/api/manifest/EventCloseout/commands/capture",
  instanceCommand: true,
  clientParameterNames: ["eventId","actualRevenue","budgetedRevenue","revenueVariance","actualIngredientCost","actualWasteCost","actualLaborCost","actualVendorCost","budgetedCost","totalActualCost","costVariance","grossProfit","expectedHeadcount","actualHeadcount","unresolvedIssues","performanceNotes","notes"],
  serverParameterNames: [],
  emits: ["EventCloseoutCaptured"],
} as const;

/**
 * Build command input for EventCloseout.capture.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventCloseoutCaptureInput(client: EventCloseoutCaptureClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful EventCloseout.capture. */
export const EventCloseoutCaptureInvalidation = [
  {
    "kind": "entityList",
    "entity": "EventCloseout",
    "queryKeyHint": "queryKeys.eventCloseout.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "EventCloseout",
    "queryKeyHint": "queryKeys.eventCloseout.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- EventCloseout.finalize ---
export type EventCloseoutFinalizeClientInput = Record<string, never>;

export const EventCloseoutFinalizeCapability = {
  capabilityId: "EventCloseout.finalize",
  entity: "EventCloseout",
  command: "finalize",
  route: "/api/manifest/EventCloseout/commands/finalize",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["EventCloseoutFinalized"],
} as const;

/**
 * Build command input for EventCloseout.finalize.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventCloseoutFinalizeInput(client: EventCloseoutFinalizeClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful EventCloseout.finalize. */
export const EventCloseoutFinalizeInvalidation = [
  {
    "kind": "entityList",
    "entity": "EventCloseout",
    "queryKeyHint": "queryKeys.eventCloseout.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "EventCloseout",
    "queryKeyHint": "queryKeys.eventCloseout.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for EventCloseout.finalize. */
export const EventCloseoutFinalizeLifecycle = [
  {
    "property": "status",
    "from": "draft",
    "to": "finalized",
    "proven": true
  }
] as const;

// --- EventDish.addToEvent ---
export interface EventDishAddToEventClientInput {
  eventId: string;
  dishId: string;
  /** Bounds: 0..∞ */
  quantityServings: number;
  course?: string;
  serviceStyle?: string;
  specialInstructions?: string;
}

export const EventDishAddToEventCapability = {
  capabilityId: "EventDish.addToEvent",
  entity: "EventDish",
  command: "addToEvent",
  route: "/api/manifest/EventDish/commands/addToEvent",
  instanceCommand: true,
  clientParameterNames: ["eventId","dishId","quantityServings","course","serviceStyle","specialInstructions"],
  serverParameterNames: [],
  emits: ["EventDishAdded"],
} as const;

/**
 * Build command input for EventDish.addToEvent.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventDishAddToEventInput(client: EventDishAddToEventClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful EventDish.addToEvent. */
export const EventDishAddToEventInvalidation = [
  {
    "kind": "entityList",
    "entity": "EventDish",
    "queryKeyHint": "queryKeys.eventDish.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "EventDish",
    "queryKeyHint": "queryKeys.eventDish.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- EventDish.adjustServings ---
export interface EventDishAdjustServingsClientInput {
  /** Bounds: 0..∞ */
  quantityServings: number;
}

export const EventDishAdjustServingsCapability = {
  capabilityId: "EventDish.adjustServings",
  entity: "EventDish",
  command: "adjustServings",
  route: "/api/manifest/EventDish/commands/adjustServings",
  instanceCommand: true,
  clientParameterNames: ["quantityServings"],
  serverParameterNames: [],
  emits: ["EventDishServingsAdjusted"],
} as const;

/**
 * Build command input for EventDish.adjustServings.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventDishAdjustServingsInput(client: EventDishAdjustServingsClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful EventDish.adjustServings. */
export const EventDishAdjustServingsInvalidation = [
  {
    "kind": "entityList",
    "entity": "EventDish",
    "queryKeyHint": "queryKeys.eventDish.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "EventDish",
    "queryKeyHint": "queryKeys.eventDish.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- EventDish.changeCourse ---
export interface EventDishChangeCourseClientInput {
  course?: string;
  serviceStyle?: string;
}

export const EventDishChangeCourseCapability = {
  capabilityId: "EventDish.changeCourse",
  entity: "EventDish",
  command: "changeCourse",
  route: "/api/manifest/EventDish/commands/changeCourse",
  instanceCommand: true,
  clientParameterNames: ["course","serviceStyle"],
  serverParameterNames: [],
  emits: ["EventDishCourseChanged"],
} as const;

/**
 * Build command input for EventDish.changeCourse.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventDishChangeCourseInput(client: EventDishChangeCourseClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful EventDish.changeCourse. */
export const EventDishChangeCourseInvalidation = [
  {
    "kind": "entityList",
    "entity": "EventDish",
    "queryKeyHint": "queryKeys.eventDish.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "EventDish",
    "queryKeyHint": "queryKeys.eventDish.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- EventDish.remove ---
export interface EventDishRemoveClientInput {
  reason: string;
}

export const EventDishRemoveCapability = {
  capabilityId: "EventDish.remove",
  entity: "EventDish",
  command: "remove",
  route: "/api/manifest/EventDish/commands/remove",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["EventDishRemoved"],
} as const;

/**
 * Build command input for EventDish.remove.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventDishRemoveInput(client: EventDishRemoveClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful EventDish.remove. */
export const EventDishRemoveInvalidation = [
  {
    "kind": "entityList",
    "entity": "EventDish",
    "queryKeyHint": "queryKeys.eventDish.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "EventDish",
    "queryKeyHint": "queryKeys.eventDish.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- EventDish.updateInstructions ---
export interface EventDishUpdateInstructionsClientInput {
  specialInstructions?: string;
}

export const EventDishUpdateInstructionsCapability = {
  capabilityId: "EventDish.updateInstructions",
  entity: "EventDish",
  command: "updateInstructions",
  route: "/api/manifest/EventDish/commands/updateInstructions",
  instanceCommand: true,
  clientParameterNames: ["specialInstructions"],
  serverParameterNames: [],
  emits: ["EventDishInstructionsUpdated"],
} as const;

/**
 * Build command input for EventDish.updateInstructions.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventDishUpdateInstructionsInput(client: EventDishUpdateInstructionsClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful EventDish.updateInstructions. */
export const EventDishUpdateInstructionsInvalidation = [
  {
    "kind": "entityList",
    "entity": "EventDish",
    "queryKeyHint": "queryKeys.eventDish.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "EventDish",
    "queryKeyHint": "queryKeys.eventDish.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- EventGuest.assignTable ---
export interface EventGuestAssignTableClientInput {
  tableAssignment: string;
}

export const EventGuestAssignTableCapability = {
  capabilityId: "EventGuest.assignTable",
  entity: "EventGuest",
  command: "assignTable",
  route: "/api/manifest/EventGuest/commands/assignTable",
  instanceCommand: true,
  clientParameterNames: ["tableAssignment"],
  serverParameterNames: [],
  emits: ["EventGuestTableAssigned"],
} as const;

/**
 * Build command input for EventGuest.assignTable.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventGuestAssignTableInput(client: EventGuestAssignTableClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful EventGuest.assignTable. */
export const EventGuestAssignTableInvalidation = [
  {
    "kind": "entityList",
    "entity": "EventGuest",
    "queryKeyHint": "queryKeys.eventGuest.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "EventGuest",
    "queryKeyHint": "queryKeys.eventGuest.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- EventGuest.checkIn ---
export type EventGuestCheckInClientInput = Record<string, never>;

export const EventGuestCheckInCapability = {
  capabilityId: "EventGuest.checkIn",
  entity: "EventGuest",
  command: "checkIn",
  route: "/api/manifest/EventGuest/commands/checkIn",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["EventGuestCheckedIn"],
} as const;

/**
 * Build command input for EventGuest.checkIn.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventGuestCheckInInput(client: EventGuestCheckInClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful EventGuest.checkIn. */
export const EventGuestCheckInInvalidation = [
  {
    "kind": "entityList",
    "entity": "EventGuest",
    "queryKeyHint": "queryKeys.eventGuest.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "EventGuest",
    "queryKeyHint": "queryKeys.eventGuest.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- EventGuest.invite ---
export interface EventGuestInviteClientInput {
  eventId: string;
  name: string;
  email?: string;
  phone?: string;
  dietaryRestrictions?: string[];
  allergenRestrictions?: string[];
  accessibilityNeeds?: string[];
  specialMealRequired?: boolean;
}

export const EventGuestInviteCapability = {
  capabilityId: "EventGuest.invite",
  entity: "EventGuest",
  command: "invite",
  route: "/api/manifest/EventGuest/commands/invite",
  instanceCommand: true,
  clientParameterNames: ["eventId","name","email","phone","dietaryRestrictions","allergenRestrictions","accessibilityNeeds","specialMealRequired"],
  serverParameterNames: [],
  emits: ["EventGuestInvited"],
} as const;

/**
 * Build command input for EventGuest.invite.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventGuestInviteInput(client: EventGuestInviteClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful EventGuest.invite. */
export const EventGuestInviteInvalidation = [
  {
    "kind": "entityList",
    "entity": "EventGuest",
    "queryKeyHint": "queryKeys.eventGuest.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "EventGuest",
    "queryKeyHint": "queryKeys.eventGuest.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- EventGuest.rsvpConfirm ---
export type EventGuestRsvpConfirmClientInput = Record<string, never>;

export const EventGuestRsvpConfirmCapability = {
  capabilityId: "EventGuest.rsvpConfirm",
  entity: "EventGuest",
  command: "rsvpConfirm",
  route: "/api/manifest/EventGuest/commands/rsvpConfirm",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["EventGuestRsvpConfirmed"],
} as const;

/**
 * Build command input for EventGuest.rsvpConfirm.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventGuestRsvpConfirmInput(client: EventGuestRsvpConfirmClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful EventGuest.rsvpConfirm. */
export const EventGuestRsvpConfirmInvalidation = [
  {
    "kind": "entityList",
    "entity": "EventGuest",
    "queryKeyHint": "queryKeys.eventGuest.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "EventGuest",
    "queryKeyHint": "queryKeys.eventGuest.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for EventGuest.rsvpConfirm. */
export const EventGuestRsvpConfirmLifecycle = [
  {
    "property": "rsvpStatus",
    "from": "pending",
    "to": "confirmed",
    "proven": true
  },
  {
    "property": "rsvpStatus",
    "from": "confirmed",
    "to": "confirmed",
    "proven": true
  }
] as const;

// --- EventGuest.rsvpDecline ---
export interface EventGuestRsvpDeclineClientInput {
  reason?: string;
}

export const EventGuestRsvpDeclineCapability = {
  capabilityId: "EventGuest.rsvpDecline",
  entity: "EventGuest",
  command: "rsvpDecline",
  route: "/api/manifest/EventGuest/commands/rsvpDecline",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["EventGuestRsvpDeclined"],
} as const;

/**
 * Build command input for EventGuest.rsvpDecline.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventGuestRsvpDeclineInput(client: EventGuestRsvpDeclineClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful EventGuest.rsvpDecline. */
export const EventGuestRsvpDeclineInvalidation = [
  {
    "kind": "entityList",
    "entity": "EventGuest",
    "queryKeyHint": "queryKeys.eventGuest.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "EventGuest",
    "queryKeyHint": "queryKeys.eventGuest.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for EventGuest.rsvpDecline. */
export const EventGuestRsvpDeclineLifecycle = [
  {
    "property": "rsvpStatus",
    "from": "pending",
    "to": "declined",
    "proven": true
  },
  {
    "property": "rsvpStatus",
    "from": "confirmed",
    "to": "declined",
    "proven": true
  }
] as const;

// --- EventGuest.withdraw ---
export interface EventGuestWithdrawClientInput {
  reason: string;
}

export const EventGuestWithdrawCapability = {
  capabilityId: "EventGuest.withdraw",
  entity: "EventGuest",
  command: "withdraw",
  route: "/api/manifest/EventGuest/commands/withdraw",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["EventGuestWithdrawn"],
} as const;

/**
 * Build command input for EventGuest.withdraw.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindEventGuestWithdrawInput(client: EventGuestWithdrawClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful EventGuest.withdraw. */
export const EventGuestWithdrawInvalidation = [
  {
    "kind": "entityList",
    "entity": "EventGuest",
    "queryKeyHint": "queryKeys.eventGuest.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "EventGuest",
    "queryKeyHint": "queryKeys.eventGuest.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Incident.beginInvestigation ---
export type IncidentBeginInvestigationClientInput = Record<string, never>;

export const IncidentBeginInvestigationCapability = {
  capabilityId: "Incident.beginInvestigation",
  entity: "Incident",
  command: "beginInvestigation",
  route: "/api/manifest/Incident/commands/beginInvestigation",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["IncidentInvestigationStarted"],
} as const;

/**
 * Build command input for Incident.beginInvestigation.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindIncidentBeginInvestigationInput(client: IncidentBeginInvestigationClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Incident.beginInvestigation. */
export const IncidentBeginInvestigationInvalidation = [
  {
    "kind": "entityList",
    "entity": "Incident",
    "queryKeyHint": "queryKeys.incident.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Incident",
    "queryKeyHint": "queryKeys.incident.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Incident.beginInvestigation. */
export const IncidentBeginInvestigationLifecycle = [
  {
    "property": "status",
    "from": "open",
    "to": "investigating",
    "proven": true
  }
] as const;

// --- Incident.dismiss ---
export interface IncidentDismissClientInput {
  reason: string;
}

export const IncidentDismissCapability = {
  capabilityId: "Incident.dismiss",
  entity: "Incident",
  command: "dismiss",
  route: "/api/manifest/Incident/commands/dismiss",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["IncidentDismissed"],
} as const;

/**
 * Build command input for Incident.dismiss.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindIncidentDismissInput(client: IncidentDismissClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Incident.dismiss. */
export const IncidentDismissInvalidation = [
  {
    "kind": "entityList",
    "entity": "Incident",
    "queryKeyHint": "queryKeys.incident.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Incident",
    "queryKeyHint": "queryKeys.incident.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Incident.dismiss. */
export const IncidentDismissLifecycle = [
  {
    "property": "status",
    "from": "open",
    "to": "dismissed",
    "proven": true
  },
  {
    "property": "status",
    "from": "investigating",
    "to": "dismissed",
    "proven": true
  }
] as const;

// --- Incident.markResolved ---
export interface IncidentMarkResolvedClientInput {
  resolution: string;
}

export const IncidentMarkResolvedCapability = {
  capabilityId: "Incident.markResolved",
  entity: "Incident",
  command: "markResolved",
  route: "/api/manifest/Incident/commands/markResolved",
  instanceCommand: true,
  clientParameterNames: ["resolution"],
  serverParameterNames: [],
  emits: ["IncidentResolved"],
} as const;

/**
 * Build command input for Incident.markResolved.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindIncidentMarkResolvedInput(client: IncidentMarkResolvedClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Incident.markResolved. */
export const IncidentMarkResolvedInvalidation = [
  {
    "kind": "entityList",
    "entity": "Incident",
    "queryKeyHint": "queryKeys.incident.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Incident",
    "queryKeyHint": "queryKeys.incident.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Incident.markResolved. */
export const IncidentMarkResolvedLifecycle = [
  {
    "property": "status",
    "from": "open",
    "to": "resolved",
    "proven": true
  },
  {
    "property": "status",
    "from": "investigating",
    "to": "resolved",
    "proven": true
  }
] as const;

// --- Incident.report ---
export interface IncidentReportClientInput {
  eventId: string;
  /** Allowed: "low" | "medium" | "high" | "critical" */
  severity: "low" | "medium" | "high" | "critical";
  /** Allowed: "food_safety" | "injury" | "equipment" | "service" | "other" */
  category: "food_safety" | "injury" | "equipment" | "service" | "other";
  description: string;
  prepTaskId?: string;
  deliveryId?: string;
  shiftId?: string;
}

export const IncidentReportCapability = {
  capabilityId: "Incident.report",
  entity: "Incident",
  command: "report",
  route: "/api/manifest/Incident/commands/report",
  instanceCommand: true,
  clientParameterNames: ["eventId","severity","category","description","prepTaskId","deliveryId","shiftId"],
  serverParameterNames: [],
  emits: ["IncidentReported"],
} as const;

/**
 * Build command input for Incident.report.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindIncidentReportInput(client: IncidentReportClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Incident.report. */
export const IncidentReportInvalidation = [
  {
    "kind": "entityList",
    "entity": "Incident",
    "queryKeyHint": "queryKeys.incident.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Incident",
    "queryKeyHint": "queryKeys.incident.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Ingredient.classifyAllergens ---
export interface IngredientClassifyAllergensClientInput {
  allergens: ("milk" | "eggs" | "fish" | "crustacean_shellfish" | "tree_nuts" | "peanuts" | "wheat" | "soybeans" | "sesame")[];
}

export const IngredientClassifyAllergensCapability = {
  capabilityId: "Ingredient.classifyAllergens",
  entity: "Ingredient",
  command: "classifyAllergens",
  route: "/api/manifest/Ingredient/commands/classifyAllergens",
  instanceCommand: true,
  clientParameterNames: ["allergens"],
  serverParameterNames: [],
  emits: ["IngredientAllergensClassified"],
} as const;

/**
 * Build command input for Ingredient.classifyAllergens.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindIngredientClassifyAllergensInput(client: IngredientClassifyAllergensClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Ingredient.classifyAllergens. */
export const IngredientClassifyAllergensInvalidation = [
  {
    "kind": "entityList",
    "entity": "Ingredient",
    "queryKeyHint": "queryKeys.ingredient.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Ingredient",
    "queryKeyHint": "queryKeys.ingredient.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Ingredient.discontinue ---
export interface IngredientDiscontinueClientInput {
  reason: string;
}

export const IngredientDiscontinueCapability = {
  capabilityId: "Ingredient.discontinue",
  entity: "Ingredient",
  command: "discontinue",
  route: "/api/manifest/Ingredient/commands/discontinue",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["IngredientDiscontinued"],
} as const;

/**
 * Build command input for Ingredient.discontinue.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindIngredientDiscontinueInput(client: IngredientDiscontinueClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Ingredient.discontinue. */
export const IngredientDiscontinueInvalidation = [
  {
    "kind": "entityList",
    "entity": "Ingredient",
    "queryKeyHint": "queryKeys.ingredient.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Ingredient",
    "queryKeyHint": "queryKeys.ingredient.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Ingredient.discontinue. */
export const IngredientDiscontinueLifecycle = [
  {
    "property": "status",
    "from": "active",
    "to": "discontinued",
    "proven": true
  }
] as const;

// --- Ingredient.introduce ---
export interface IngredientIntroduceClientInput {
  name: string;
  /** Allowed: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion" */
  unit: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion";
  /** Bounds: 0..∞ */
  costPerUnit: number;
  allergens?: ("milk" | "eggs" | "fish" | "crustacean_shellfish" | "tree_nuts" | "peanuts" | "wheat" | "soybeans" | "sesame")[];
  category?: string;
}

export const IngredientIntroduceCapability = {
  capabilityId: "Ingredient.introduce",
  entity: "Ingredient",
  command: "introduce",
  route: "/api/manifest/Ingredient/commands/introduce",
  instanceCommand: true,
  clientParameterNames: ["name","unit","costPerUnit","allergens","category"],
  serverParameterNames: [],
  emits: ["IngredientIntroduced"],
} as const;

/**
 * Build command input for Ingredient.introduce.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindIngredientIntroduceInput(client: IngredientIntroduceClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Ingredient.introduce. */
export const IngredientIntroduceInvalidation = [
  {
    "kind": "entityList",
    "entity": "Ingredient",
    "queryKeyHint": "queryKeys.ingredient.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Ingredient",
    "queryKeyHint": "queryKeys.ingredient.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Ingredient.reinstate ---
export type IngredientReinstateClientInput = Record<string, never>;

export const IngredientReinstateCapability = {
  capabilityId: "Ingredient.reinstate",
  entity: "Ingredient",
  command: "reinstate",
  route: "/api/manifest/Ingredient/commands/reinstate",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["IngredientReinstated"],
} as const;

/**
 * Build command input for Ingredient.reinstate.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindIngredientReinstateInput(client: IngredientReinstateClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Ingredient.reinstate. */
export const IngredientReinstateInvalidation = [
  {
    "kind": "entityList",
    "entity": "Ingredient",
    "queryKeyHint": "queryKeys.ingredient.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Ingredient",
    "queryKeyHint": "queryKeys.ingredient.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Ingredient.reinstate. */
export const IngredientReinstateLifecycle = [
  {
    "property": "status",
    "from": "discontinued",
    "to": "active",
    "proven": true
  }
] as const;

// --- Ingredient.updateCosting ---
export interface IngredientUpdateCostingClientInput {
  /** Bounds: 0..∞ */
  costPerUnit: number;
}

export const IngredientUpdateCostingCapability = {
  capabilityId: "Ingredient.updateCosting",
  entity: "Ingredient",
  command: "updateCosting",
  route: "/api/manifest/Ingredient/commands/updateCosting",
  instanceCommand: true,
  clientParameterNames: ["costPerUnit"],
  serverParameterNames: [],
  emits: ["IngredientCostingUpdated"],
} as const;

/**
 * Build command input for Ingredient.updateCosting.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindIngredientUpdateCostingInput(client: IngredientUpdateCostingClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Ingredient.updateCosting. */
export const IngredientUpdateCostingInvalidation = [
  {
    "kind": "entityList",
    "entity": "Ingredient",
    "queryKeyHint": "queryKeys.ingredient.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Ingredient",
    "queryKeyHint": "queryKeys.ingredient.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Ingredient.updateDetails ---
export interface IngredientUpdateDetailsClientInput {
  name: string;
  /** Allowed: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion" */
  unit: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion";
  category?: string;
}

export const IngredientUpdateDetailsCapability = {
  capabilityId: "Ingredient.updateDetails",
  entity: "Ingredient",
  command: "updateDetails",
  route: "/api/manifest/Ingredient/commands/updateDetails",
  instanceCommand: true,
  clientParameterNames: ["name","unit","category"],
  serverParameterNames: [],
  emits: ["IngredientDetailsUpdated"],
} as const;

/**
 * Build command input for Ingredient.updateDetails.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindIngredientUpdateDetailsInput(client: IngredientUpdateDetailsClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Ingredient.updateDetails. */
export const IngredientUpdateDetailsInvalidation = [
  {
    "kind": "entityList",
    "entity": "Ingredient",
    "queryKeyHint": "queryKeys.ingredient.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Ingredient",
    "queryKeyHint": "queryKeys.ingredient.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- IngredientDemand.calculate ---
export interface IngredientDemandCalculateClientInput {
  eventId: string;
  ingredientId: string;
  /** Bounds: 1..∞ */
  requiredQuantity: number;
  /** Allowed: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion" */
  unit: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion";
  /** Bounds: 0..∞ */
  servings?: number;
  dishId?: string;
  /** Bounds: 0..∞ */
  sourceRecipeLineQuantity?: number;
  /** Bounds: 0..∞ */
  sourceBatchMultiplier?: number;
  /** Bounds: 1..∞ */
  sourceYieldQuantity?: number;
}

export const IngredientDemandCalculateCapability = {
  capabilityId: "IngredientDemand.calculate",
  entity: "IngredientDemand",
  command: "calculate",
  route: "/api/manifest/IngredientDemand/commands/calculate",
  instanceCommand: true,
  clientParameterNames: ["eventId","ingredientId","requiredQuantity","unit","servings","dishId","sourceRecipeLineQuantity","sourceBatchMultiplier","sourceYieldQuantity"],
  serverParameterNames: [],
  emits: ["IngredientDemandCalculated"],
} as const;

/**
 * Build command input for IngredientDemand.calculate.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindIngredientDemandCalculateInput(client: IngredientDemandCalculateClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful IngredientDemand.calculate. */
export const IngredientDemandCalculateInvalidation = [
  {
    "kind": "entityList",
    "entity": "IngredientDemand",
    "queryKeyHint": "queryKeys.ingredientDemand.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "IngredientDemand",
    "queryKeyHint": "queryKeys.ingredientDemand.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for IngredientDemand.calculate. */
export const IngredientDemandCalculateLifecycle = [
  {
    "property": "status",
    "from": "pending",
    "to": "calculated",
    "proven": true
  }
] as const;

// --- IngredientDemand.confirm ---
export type IngredientDemandConfirmClientInput = Record<string, never>;

export const IngredientDemandConfirmCapability = {
  capabilityId: "IngredientDemand.confirm",
  entity: "IngredientDemand",
  command: "confirm",
  route: "/api/manifest/IngredientDemand/commands/confirm",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["IngredientDemandConfirmed"],
} as const;

/**
 * Build command input for IngredientDemand.confirm.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindIngredientDemandConfirmInput(client: IngredientDemandConfirmClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful IngredientDemand.confirm. */
export const IngredientDemandConfirmInvalidation = [
  {
    "kind": "entityList",
    "entity": "IngredientDemand",
    "queryKeyHint": "queryKeys.ingredientDemand.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "IngredientDemand",
    "queryKeyHint": "queryKeys.ingredientDemand.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for IngredientDemand.confirm. */
export const IngredientDemandConfirmLifecycle = [
  {
    "property": "status",
    "from": "calculated",
    "to": "confirmed",
    "proven": true
  }
] as const;

// --- IngredientDemand.fulfill ---
export type IngredientDemandFulfillClientInput = Record<string, never>;

export const IngredientDemandFulfillCapability = {
  capabilityId: "IngredientDemand.fulfill",
  entity: "IngredientDemand",
  command: "fulfill",
  route: "/api/manifest/IngredientDemand/commands/fulfill",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["IngredientDemandFulfilled"],
} as const;

/**
 * Build command input for IngredientDemand.fulfill.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindIngredientDemandFulfillInput(client: IngredientDemandFulfillClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful IngredientDemand.fulfill. */
export const IngredientDemandFulfillInvalidation = [
  {
    "kind": "entityList",
    "entity": "IngredientDemand",
    "queryKeyHint": "queryKeys.ingredientDemand.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "IngredientDemand",
    "queryKeyHint": "queryKeys.ingredientDemand.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for IngredientDemand.fulfill. */
export const IngredientDemandFulfillLifecycle = [
  {
    "property": "status",
    "from": "confirmed",
    "to": "fulfilled",
    "proven": true
  }
] as const;

// --- IngredientDemand.recalculate ---
export interface IngredientDemandRecalculateClientInput {
  /** Bounds: 1..∞ */
  newQuantity: number;
  reason: string;
}

export const IngredientDemandRecalculateCapability = {
  capabilityId: "IngredientDemand.recalculate",
  entity: "IngredientDemand",
  command: "recalculate",
  route: "/api/manifest/IngredientDemand/commands/recalculate",
  instanceCommand: true,
  clientParameterNames: ["newQuantity","reason"],
  serverParameterNames: [],
  emits: ["IngredientDemandRecalculated"],
} as const;

/**
 * Build command input for IngredientDemand.recalculate.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindIngredientDemandRecalculateInput(client: IngredientDemandRecalculateClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful IngredientDemand.recalculate. */
export const IngredientDemandRecalculateInvalidation = [
  {
    "kind": "entityList",
    "entity": "IngredientDemand",
    "queryKeyHint": "queryKeys.ingredientDemand.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "IngredientDemand",
    "queryKeyHint": "queryKeys.ingredientDemand.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- IngredientDemand.supersede ---
export interface IngredientDemandSupersedeClientInput {
  reason: string;
}

export const IngredientDemandSupersedeCapability = {
  capabilityId: "IngredientDemand.supersede",
  entity: "IngredientDemand",
  command: "supersede",
  route: "/api/manifest/IngredientDemand/commands/supersede",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["IngredientDemandSuperseded"],
} as const;

/**
 * Build command input for IngredientDemand.supersede.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindIngredientDemandSupersedeInput(client: IngredientDemandSupersedeClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful IngredientDemand.supersede. */
export const IngredientDemandSupersedeInvalidation = [
  {
    "kind": "entityList",
    "entity": "IngredientDemand",
    "queryKeyHint": "queryKeys.ingredientDemand.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "IngredientDemand",
    "queryKeyHint": "queryKeys.ingredientDemand.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for IngredientDemand.supersede. */
export const IngredientDemandSupersedeLifecycle = [
  {
    "property": "status",
    "from": "calculated",
    "to": "superseded",
    "proven": true
  },
  {
    "property": "status",
    "from": "confirmed",
    "to": "superseded",
    "proven": true
  }
] as const;

// --- InventoryItem.adjustQuantity ---
export interface InventoryItemAdjustQuantityClientInput {
  delta: number;
  reason: string;
}

export const InventoryItemAdjustQuantityCapability = {
  capabilityId: "InventoryItem.adjustQuantity",
  entity: "InventoryItem",
  command: "adjustQuantity",
  route: "/api/manifest/InventoryItem/commands/adjustQuantity",
  instanceCommand: true,
  clientParameterNames: ["delta","reason"],
  serverParameterNames: [],
  emits: ["InventoryQuantityAdjusted"],
} as const;

/**
 * Build command input for InventoryItem.adjustQuantity.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindInventoryItemAdjustQuantityInput(client: InventoryItemAdjustQuantityClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful InventoryItem.adjustQuantity. */
export const InventoryItemAdjustQuantityInvalidation = [
  {
    "kind": "entityList",
    "entity": "InventoryItem",
    "queryKeyHint": "queryKeys.inventoryItem.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "InventoryItem",
    "queryKeyHint": "queryKeys.inventoryItem.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- InventoryItem.open ---
export interface InventoryItemOpenClientInput {
  ingredientId: string;
  locationId: string;
  /** Allowed: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion" */
  unit: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion";
  /** Bounds: 0..∞ */
  quantityOnHand?: number;
  /** Bounds: 0..∞ */
  parLevel?: number;
  /** Bounds: 0..∞ */
  reorderThreshold?: number;
  /** Bounds: 0..∞ */
  unitCost?: number;
}

export const InventoryItemOpenCapability = {
  capabilityId: "InventoryItem.open",
  entity: "InventoryItem",
  command: "open",
  route: "/api/manifest/InventoryItem/commands/open",
  instanceCommand: true,
  clientParameterNames: ["ingredientId","locationId","unit","quantityOnHand","parLevel","reorderThreshold","unitCost"],
  serverParameterNames: [],
  emits: ["InventoryItemOpened"],
} as const;

/**
 * Build command input for InventoryItem.open.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindInventoryItemOpenInput(client: InventoryItemOpenClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful InventoryItem.open. */
export const InventoryItemOpenInvalidation = [
  {
    "kind": "entityList",
    "entity": "InventoryItem",
    "queryKeyHint": "queryKeys.inventoryItem.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "InventoryItem",
    "queryKeyHint": "queryKeys.inventoryItem.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- InventoryItem.receiveStock ---
export interface InventoryItemReceiveStockClientInput {
  /** Bounds: 1..∞ */
  quantity: number;
  /** Bounds: 0..∞ */
  unitCost?: number;
}

export const InventoryItemReceiveStockCapability = {
  capabilityId: "InventoryItem.receiveStock",
  entity: "InventoryItem",
  command: "receiveStock",
  route: "/api/manifest/InventoryItem/commands/receiveStock",
  instanceCommand: true,
  clientParameterNames: ["quantity","unitCost"],
  serverParameterNames: [],
  emits: ["InventoryStockReceived"],
} as const;

/**
 * Build command input for InventoryItem.receiveStock.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindInventoryItemReceiveStockInput(client: InventoryItemReceiveStockClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful InventoryItem.receiveStock. */
export const InventoryItemReceiveStockInvalidation = [
  {
    "kind": "entityList",
    "entity": "InventoryItem",
    "queryKeyHint": "queryKeys.inventoryItem.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "InventoryItem",
    "queryKeyHint": "queryKeys.inventoryItem.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- InventoryItem.recount ---
export interface InventoryItemRecountClientInput {
  /** Bounds: 0..∞ */
  actualQuantity: number;
}

export const InventoryItemRecountCapability = {
  capabilityId: "InventoryItem.recount",
  entity: "InventoryItem",
  command: "recount",
  route: "/api/manifest/InventoryItem/commands/recount",
  instanceCommand: true,
  clientParameterNames: ["actualQuantity"],
  serverParameterNames: [],
  emits: ["InventoryRecounted"],
} as const;

/**
 * Build command input for InventoryItem.recount.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindInventoryItemRecountInput(client: InventoryItemRecountClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful InventoryItem.recount. */
export const InventoryItemRecountInvalidation = [
  {
    "kind": "entityList",
    "entity": "InventoryItem",
    "queryKeyHint": "queryKeys.inventoryItem.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "InventoryItem",
    "queryKeyHint": "queryKeys.inventoryItem.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- InventoryItem.remove ---
export interface InventoryItemRemoveClientInput {
  reason: string;
}

export const InventoryItemRemoveCapability = {
  capabilityId: "InventoryItem.remove",
  entity: "InventoryItem",
  command: "remove",
  route: "/api/manifest/InventoryItem/commands/remove",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["InventoryItemRemoved"],
} as const;

/**
 * Build command input for InventoryItem.remove.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindInventoryItemRemoveInput(client: InventoryItemRemoveClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful InventoryItem.remove. */
export const InventoryItemRemoveInvalidation = [
  {
    "kind": "entityList",
    "entity": "InventoryItem",
    "queryKeyHint": "queryKeys.inventoryItem.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "InventoryItem",
    "queryKeyHint": "queryKeys.inventoryItem.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- InventoryItem.transferIn ---
export interface InventoryItemTransferInClientInput {
  /** Bounds: 1..∞ */
  quantity: number;
  sourceLocationId: string;
}

export const InventoryItemTransferInCapability = {
  capabilityId: "InventoryItem.transferIn",
  entity: "InventoryItem",
  command: "transferIn",
  route: "/api/manifest/InventoryItem/commands/transferIn",
  instanceCommand: true,
  clientParameterNames: ["quantity","sourceLocationId"],
  serverParameterNames: [],
  emits: ["InventoryTransferredIn"],
} as const;

/**
 * Build command input for InventoryItem.transferIn.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindInventoryItemTransferInInput(client: InventoryItemTransferInClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful InventoryItem.transferIn. */
export const InventoryItemTransferInInvalidation = [
  {
    "kind": "entityList",
    "entity": "InventoryItem",
    "queryKeyHint": "queryKeys.inventoryItem.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "InventoryItem",
    "queryKeyHint": "queryKeys.inventoryItem.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- InventoryItem.transferOut ---
export interface InventoryItemTransferOutClientInput {
  /** Bounds: 1..∞ */
  quantity: number;
  destinationLocationId: string;
}

export const InventoryItemTransferOutCapability = {
  capabilityId: "InventoryItem.transferOut",
  entity: "InventoryItem",
  command: "transferOut",
  route: "/api/manifest/InventoryItem/commands/transferOut",
  instanceCommand: true,
  clientParameterNames: ["quantity","destinationLocationId"],
  serverParameterNames: [],
  emits: ["InventoryTransferredOut"],
} as const;

/**
 * Build command input for InventoryItem.transferOut.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindInventoryItemTransferOutInput(client: InventoryItemTransferOutClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful InventoryItem.transferOut. */
export const InventoryItemTransferOutInvalidation = [
  {
    "kind": "entityList",
    "entity": "InventoryItem",
    "queryKeyHint": "queryKeys.inventoryItem.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "InventoryItem",
    "queryKeyHint": "queryKeys.inventoryItem.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- InventoryItem.updateLevels ---
export interface InventoryItemUpdateLevelsClientInput {
  /** Bounds: 0..∞ */
  parLevel: number;
  /** Bounds: 0..∞ */
  reorderThreshold: number;
  /** Bounds: 0..∞ */
  unitCost?: number;
}

export const InventoryItemUpdateLevelsCapability = {
  capabilityId: "InventoryItem.updateLevels",
  entity: "InventoryItem",
  command: "updateLevels",
  route: "/api/manifest/InventoryItem/commands/updateLevels",
  instanceCommand: true,
  clientParameterNames: ["parLevel","reorderThreshold","unitCost"],
  serverParameterNames: [],
  emits: ["InventoryLevelsUpdated"],
} as const;

/**
 * Build command input for InventoryItem.updateLevels.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindInventoryItemUpdateLevelsInput(client: InventoryItemUpdateLevelsClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful InventoryItem.updateLevels. */
export const InventoryItemUpdateLevelsInvalidation = [
  {
    "kind": "entityList",
    "entity": "InventoryItem",
    "queryKeyHint": "queryKeys.inventoryItem.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "InventoryItem",
    "queryKeyHint": "queryKeys.inventoryItem.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- InventoryReservation.consume ---
export type InventoryReservationConsumeClientInput = Record<string, never>;

export const InventoryReservationConsumeCapability = {
  capabilityId: "InventoryReservation.consume",
  entity: "InventoryReservation",
  command: "consume",
  route: "/api/manifest/InventoryReservation/commands/consume",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["InventoryReservationConsumed"],
} as const;

/**
 * Build command input for InventoryReservation.consume.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindInventoryReservationConsumeInput(client: InventoryReservationConsumeClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful InventoryReservation.consume. */
export const InventoryReservationConsumeInvalidation = [
  {
    "kind": "entityList",
    "entity": "InventoryReservation",
    "queryKeyHint": "queryKeys.inventoryReservation.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "InventoryReservation",
    "queryKeyHint": "queryKeys.inventoryReservation.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for InventoryReservation.consume. */
export const InventoryReservationConsumeLifecycle = [
  {
    "property": "status",
    "from": "active",
    "to": "consumed",
    "proven": true
  }
] as const;

// --- InventoryReservation.release ---
export interface InventoryReservationReleaseClientInput {
  reason: string;
}

export const InventoryReservationReleaseCapability = {
  capabilityId: "InventoryReservation.release",
  entity: "InventoryReservation",
  command: "release",
  route: "/api/manifest/InventoryReservation/commands/release",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["InventoryReservationReleased"],
} as const;

/**
 * Build command input for InventoryReservation.release.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindInventoryReservationReleaseInput(client: InventoryReservationReleaseClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful InventoryReservation.release. */
export const InventoryReservationReleaseInvalidation = [
  {
    "kind": "entityList",
    "entity": "InventoryReservation",
    "queryKeyHint": "queryKeys.inventoryReservation.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "InventoryReservation",
    "queryKeyHint": "queryKeys.inventoryReservation.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for InventoryReservation.release. */
export const InventoryReservationReleaseLifecycle = [
  {
    "property": "status",
    "from": "active",
    "to": "released",
    "proven": true
  }
] as const;

// --- InventoryReservation.reserve ---
export interface InventoryReservationReserveClientInput {
  inventoryItemId: string;
  eventId: string;
  ingredientId: string;
  /** Bounds: 1..∞ */
  quantity: number;
}

export const InventoryReservationReserveCapability = {
  capabilityId: "InventoryReservation.reserve",
  entity: "InventoryReservation",
  command: "reserve",
  route: "/api/manifest/InventoryReservation/commands/reserve",
  instanceCommand: true,
  clientParameterNames: ["inventoryItemId","eventId","ingredientId","quantity"],
  serverParameterNames: [],
  emits: ["InventoryReserved"],
} as const;

/**
 * Build command input for InventoryReservation.reserve.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindInventoryReservationReserveInput(client: InventoryReservationReserveClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful InventoryReservation.reserve. */
export const InventoryReservationReserveInvalidation = [
  {
    "kind": "entityList",
    "entity": "InventoryReservation",
    "queryKeyHint": "queryKeys.inventoryReservation.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "InventoryReservation",
    "queryKeyHint": "queryKeys.inventoryReservation.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for InventoryReservation.reserve. */
export const InventoryReservationReserveLifecycle = [
  {
    "property": "status",
    "from": "pending",
    "to": "active",
    "proven": true
  }
] as const;

// --- Invoice.applyPayment ---
export interface InvoiceApplyPaymentClientInput {
  /** Bounds: 1..∞ */
  paymentAmount: number;
  paymentId?: string;
}

export const InvoiceApplyPaymentCapability = {
  capabilityId: "Invoice.applyPayment",
  entity: "Invoice",
  command: "applyPayment",
  route: "/api/manifest/Invoice/commands/applyPayment",
  instanceCommand: true,
  clientParameterNames: ["paymentAmount","paymentId"],
  serverParameterNames: [],
  emits: ["InvoicePaymentApplied"],
} as const;

/**
 * Build command input for Invoice.applyPayment.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindInvoiceApplyPaymentInput(client: InvoiceApplyPaymentClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Invoice.applyPayment. */
export const InvoiceApplyPaymentInvalidation = [
  {
    "kind": "entityList",
    "entity": "Invoice",
    "queryKeyHint": "queryKeys.invoice.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Invoice",
    "queryKeyHint": "queryKeys.invoice.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Invoice.issue ---
export interface InvoiceIssueClientInput {
  clientId: string;
  invoiceNumber: string;
  /** Bounds: 0..∞ */
  subtotal: number;
  /** Bounds: 0..∞ */
  taxAmount: number;
  /** Bounds: 0..∞ */
  discountAmount: number;
  /** Bounds: 0..∞ */
  total: number;
  eventId?: string;
  paymentTermsDays?: number;
  dueDate?: string;
  notes?: string;
}

export const InvoiceIssueCapability = {
  capabilityId: "Invoice.issue",
  entity: "Invoice",
  command: "issue",
  route: "/api/manifest/Invoice/commands/issue",
  instanceCommand: true,
  clientParameterNames: ["clientId","invoiceNumber","subtotal","taxAmount","discountAmount","total","eventId","paymentTermsDays","dueDate","notes"],
  serverParameterNames: [],
  emits: ["InvoiceIssued"],
} as const;

/**
 * Build command input for Invoice.issue.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindInvoiceIssueInput(client: InvoiceIssueClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Invoice.issue. */
export const InvoiceIssueInvalidation = [
  {
    "kind": "entityList",
    "entity": "Invoice",
    "queryKeyHint": "queryKeys.invoice.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Invoice",
    "queryKeyHint": "queryKeys.invoice.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Invoice.markOverdue ---
export type InvoiceMarkOverdueClientInput = Record<string, never>;

export const InvoiceMarkOverdueCapability = {
  capabilityId: "Invoice.markOverdue",
  entity: "Invoice",
  command: "markOverdue",
  route: "/api/manifest/Invoice/commands/markOverdue",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["InvoiceMarkedOverdue"],
} as const;

/**
 * Build command input for Invoice.markOverdue.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindInvoiceMarkOverdueInput(client: InvoiceMarkOverdueClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Invoice.markOverdue. */
export const InvoiceMarkOverdueInvalidation = [
  {
    "kind": "entityList",
    "entity": "Invoice",
    "queryKeyHint": "queryKeys.invoice.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Invoice",
    "queryKeyHint": "queryKeys.invoice.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Invoice.markOverdue. */
export const InvoiceMarkOverdueLifecycle = [
  {
    "property": "status",
    "from": "sent",
    "to": "overdue",
    "proven": true
  },
  {
    "property": "status",
    "from": "viewed",
    "to": "overdue",
    "proven": true
  },
  {
    "property": "status",
    "from": "partial",
    "to": "overdue",
    "proven": true
  }
] as const;

// --- Invoice.markViewed ---
export type InvoiceMarkViewedClientInput = Record<string, never>;

export const InvoiceMarkViewedCapability = {
  capabilityId: "Invoice.markViewed",
  entity: "Invoice",
  command: "markViewed",
  route: "/api/manifest/Invoice/commands/markViewed",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["InvoiceViewed"],
} as const;

/**
 * Build command input for Invoice.markViewed.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindInvoiceMarkViewedInput(client: InvoiceMarkViewedClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Invoice.markViewed. */
export const InvoiceMarkViewedInvalidation = [
  {
    "kind": "entityList",
    "entity": "Invoice",
    "queryKeyHint": "queryKeys.invoice.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Invoice",
    "queryKeyHint": "queryKeys.invoice.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Invoice.markViewed. */
export const InvoiceMarkViewedLifecycle = [
  {
    "property": "status",
    "from": "sent",
    "to": "viewed",
    "proven": true
  }
] as const;

// --- Invoice.markVoided ---
export interface InvoiceMarkVoidedClientInput {
  reason: string;
}

export const InvoiceMarkVoidedCapability = {
  capabilityId: "Invoice.markVoided",
  entity: "Invoice",
  command: "markVoided",
  route: "/api/manifest/Invoice/commands/markVoided",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["InvoiceVoided"],
} as const;

/**
 * Build command input for Invoice.markVoided.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindInvoiceMarkVoidedInput(client: InvoiceMarkVoidedClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Invoice.markVoided. */
export const InvoiceMarkVoidedInvalidation = [
  {
    "kind": "entityList",
    "entity": "Invoice",
    "queryKeyHint": "queryKeys.invoice.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Invoice",
    "queryKeyHint": "queryKeys.invoice.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Invoice.markVoided. */
export const InvoiceMarkVoidedLifecycle = [
  {
    "property": "status",
    "from": "draft",
    "to": "voided",
    "proven": true
  },
  {
    "property": "status",
    "from": "sent",
    "to": "voided",
    "proven": true
  },
  {
    "property": "status",
    "from": "viewed",
    "to": "voided",
    "proven": true
  },
  {
    "property": "status",
    "from": "overdue",
    "to": "voided",
    "proven": true
  }
] as const;

// --- Invoice.recordRefund ---
export interface InvoiceRecordRefundClientInput {
  /** Bounds: 1..∞ */
  refundAmount: number;
  paymentId: string;
}

export const InvoiceRecordRefundCapability = {
  capabilityId: "Invoice.recordRefund",
  entity: "Invoice",
  command: "recordRefund",
  route: "/api/manifest/Invoice/commands/recordRefund",
  instanceCommand: true,
  clientParameterNames: ["refundAmount","paymentId"],
  serverParameterNames: [],
  emits: ["InvoiceRefundRecorded"],
} as const;

/**
 * Build command input for Invoice.recordRefund.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindInvoiceRecordRefundInput(client: InvoiceRecordRefundClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Invoice.recordRefund. */
export const InvoiceRecordRefundInvalidation = [
  {
    "kind": "entityList",
    "entity": "Invoice",
    "queryKeyHint": "queryKeys.invoice.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Invoice",
    "queryKeyHint": "queryKeys.invoice.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Invoice.recordRefund. */
export const InvoiceRecordRefundLifecycle = [
  {
    "property": "status",
    "from": "sent",
    "to": "partial",
    "proven": true
  },
  {
    "property": "status",
    "from": "viewed",
    "to": "partial",
    "proven": true
  },
  {
    "property": "status",
    "from": "overdue",
    "to": "partial",
    "proven": true
  },
  {
    "property": "status",
    "from": "partial",
    "to": "partial",
    "proven": true
  },
  {
    "property": "status",
    "from": "paid",
    "to": "partial",
    "proven": true
  }
] as const;

// --- Invoice.send ---
export type InvoiceSendClientInput = Record<string, never>;

export const InvoiceSendCapability = {
  capabilityId: "Invoice.send",
  entity: "Invoice",
  command: "send",
  route: "/api/manifest/Invoice/commands/send",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["InvoiceSent"],
} as const;

/**
 * Build command input for Invoice.send.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindInvoiceSendInput(client: InvoiceSendClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Invoice.send. */
export const InvoiceSendInvalidation = [
  {
    "kind": "entityList",
    "entity": "Invoice",
    "queryKeyHint": "queryKeys.invoice.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Invoice",
    "queryKeyHint": "queryKeys.invoice.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Invoice.send. */
export const InvoiceSendLifecycle = [
  {
    "property": "status",
    "from": "draft",
    "to": "sent",
    "proven": true
  }
] as const;

// --- Invoice.writeOff ---
export interface InvoiceWriteOffClientInput {
  reason: string;
  /** Bounds: 1..∞ */
  writeOffAmount: number;
}

export const InvoiceWriteOffCapability = {
  capabilityId: "Invoice.writeOff",
  entity: "Invoice",
  command: "writeOff",
  route: "/api/manifest/Invoice/commands/writeOff",
  instanceCommand: true,
  clientParameterNames: ["reason","writeOffAmount"],
  serverParameterNames: [],
  emits: ["InvoiceWrittenOff"],
} as const;

/**
 * Build command input for Invoice.writeOff.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindInvoiceWriteOffInput(client: InvoiceWriteOffClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Invoice.writeOff. */
export const InvoiceWriteOffInvalidation = [
  {
    "kind": "entityList",
    "entity": "Invoice",
    "queryKeyHint": "queryKeys.invoice.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Invoice",
    "queryKeyHint": "queryKeys.invoice.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Invoice.writeOff. */
export const InvoiceWriteOffLifecycle = [
  {
    "property": "status",
    "from": "overdue",
    "to": "written_off",
    "proven": true
  },
  {
    "property": "status",
    "from": "partial",
    "to": "written_off",
    "proven": true
  }
] as const;

// --- Menu.archive ---
export interface MenuArchiveClientInput {
  reason: string;
}

export const MenuArchiveCapability = {
  capabilityId: "Menu.archive",
  entity: "Menu",
  command: "archive",
  route: "/api/manifest/Menu/commands/archive",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["MenuArchived"],
} as const;

/**
 * Build command input for Menu.archive.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindMenuArchiveInput(client: MenuArchiveClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Menu.archive. */
export const MenuArchiveInvalidation = [
  {
    "kind": "entityList",
    "entity": "Menu",
    "queryKeyHint": "queryKeys.menu.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Menu",
    "queryKeyHint": "queryKeys.menu.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Menu.archive. */
export const MenuArchiveLifecycle = [
  {
    "property": "status",
    "from": "draft",
    "to": "archived",
    "proven": true
  },
  {
    "property": "status",
    "from": "published",
    "to": "archived",
    "proven": true
  }
] as const;

// --- Menu.draft ---
export interface MenuDraftClientInput {
  name: string;
  description?: string;
  category?: string;
  isTemplate?: boolean;
  /** Bounds: 0..∞ */
  basePrice?: number;
  /** Bounds: 0..∞ */
  pricePerPerson?: number;
  /** Bounds: 0..∞ */
  minGuests?: number;
  /** Bounds: 0..∞ */
  maxGuests?: number;
}

export const MenuDraftCapability = {
  capabilityId: "Menu.draft",
  entity: "Menu",
  command: "draft",
  route: "/api/manifest/Menu/commands/draft",
  instanceCommand: true,
  clientParameterNames: ["name","description","category","isTemplate","basePrice","pricePerPerson","minGuests","maxGuests"],
  serverParameterNames: [],
  emits: ["MenuDrafted"],
} as const;

/**
 * Build command input for Menu.draft.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindMenuDraftInput(client: MenuDraftClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Menu.draft. */
export const MenuDraftInvalidation = [
  {
    "kind": "entityList",
    "entity": "Menu",
    "queryKeyHint": "queryKeys.menu.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Menu",
    "queryKeyHint": "queryKeys.menu.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Menu.markPublished ---
export type MenuMarkPublishedClientInput = Record<string, never>;

export const MenuMarkPublishedCapability = {
  capabilityId: "Menu.markPublished",
  entity: "Menu",
  command: "markPublished",
  route: "/api/manifest/Menu/commands/markPublished",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["MenuPublished"],
} as const;

/**
 * Build command input for Menu.markPublished.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindMenuMarkPublishedInput(client: MenuMarkPublishedClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Menu.markPublished. */
export const MenuMarkPublishedInvalidation = [
  {
    "kind": "entityList",
    "entity": "Menu",
    "queryKeyHint": "queryKeys.menu.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Menu",
    "queryKeyHint": "queryKeys.menu.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Menu.markPublished. */
export const MenuMarkPublishedLifecycle = [
  {
    "property": "status",
    "from": "draft",
    "to": "published",
    "proven": true
  }
] as const;

// --- Menu.restore ---
export type MenuRestoreClientInput = Record<string, never>;

export const MenuRestoreCapability = {
  capabilityId: "Menu.restore",
  entity: "Menu",
  command: "restore",
  route: "/api/manifest/Menu/commands/restore",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["MenuRestored"],
} as const;

/**
 * Build command input for Menu.restore.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindMenuRestoreInput(client: MenuRestoreClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Menu.restore. */
export const MenuRestoreInvalidation = [
  {
    "kind": "entityList",
    "entity": "Menu",
    "queryKeyHint": "queryKeys.menu.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Menu",
    "queryKeyHint": "queryKeys.menu.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Menu.restore. */
export const MenuRestoreLifecycle = [
  {
    "property": "status",
    "from": "published",
    "to": "draft",
    "proven": true
  },
  {
    "property": "status",
    "from": "archived",
    "to": "draft",
    "proven": true
  }
] as const;

// --- Menu.reviseDetails ---
export interface MenuReviseDetailsClientInput {
  name: string;
  description?: string;
  category?: string;
  isTemplate?: boolean;
}

export const MenuReviseDetailsCapability = {
  capabilityId: "Menu.reviseDetails",
  entity: "Menu",
  command: "reviseDetails",
  route: "/api/manifest/Menu/commands/reviseDetails",
  instanceCommand: true,
  clientParameterNames: ["name","description","category","isTemplate"],
  serverParameterNames: [],
  emits: ["MenuDetailsRevised"],
} as const;

/**
 * Build command input for Menu.reviseDetails.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindMenuReviseDetailsInput(client: MenuReviseDetailsClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Menu.reviseDetails. */
export const MenuReviseDetailsInvalidation = [
  {
    "kind": "entityList",
    "entity": "Menu",
    "queryKeyHint": "queryKeys.menu.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Menu",
    "queryKeyHint": "queryKeys.menu.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Menu.unpublish ---
export interface MenuUnpublishClientInput {
  reason: string;
}

export const MenuUnpublishCapability = {
  capabilityId: "Menu.unpublish",
  entity: "Menu",
  command: "unpublish",
  route: "/api/manifest/Menu/commands/unpublish",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["MenuUnpublished"],
} as const;

/**
 * Build command input for Menu.unpublish.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindMenuUnpublishInput(client: MenuUnpublishClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Menu.unpublish. */
export const MenuUnpublishInvalidation = [
  {
    "kind": "entityList",
    "entity": "Menu",
    "queryKeyHint": "queryKeys.menu.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Menu",
    "queryKeyHint": "queryKeys.menu.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Menu.unpublish. */
export const MenuUnpublishLifecycle = [
  {
    "property": "status",
    "from": "published",
    "to": "draft",
    "proven": true
  },
  {
    "property": "status",
    "from": "archived",
    "to": "draft",
    "proven": true
  }
] as const;

// --- Menu.updatePricing ---
export interface MenuUpdatePricingClientInput {
  /** Bounds: 0..∞ */
  basePrice: number;
  /** Bounds: 0..∞ */
  pricePerPerson: number;
  /** Bounds: 0..∞ */
  minGuests: number;
  /** Bounds: 0..∞ */
  maxGuests: number;
}

export const MenuUpdatePricingCapability = {
  capabilityId: "Menu.updatePricing",
  entity: "Menu",
  command: "updatePricing",
  route: "/api/manifest/Menu/commands/updatePricing",
  instanceCommand: true,
  clientParameterNames: ["basePrice","pricePerPerson","minGuests","maxGuests"],
  serverParameterNames: [],
  emits: ["MenuPricingUpdated"],
} as const;

/**
 * Build command input for Menu.updatePricing.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindMenuUpdatePricingInput(client: MenuUpdatePricingClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Menu.updatePricing. */
export const MenuUpdatePricingInvalidation = [
  {
    "kind": "entityList",
    "entity": "Menu",
    "queryKeyHint": "queryKeys.menu.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Menu",
    "queryKeyHint": "queryKeys.menu.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- MenuDish.add ---
export interface MenuDishAddClientInput {
  menuId: string;
  dishId: string;
  sortOrder?: number;
  course?: string;
  serviceStyle?: string;
  specialInstructions?: string;
}

export const MenuDishAddCapability = {
  capabilityId: "MenuDish.add",
  entity: "MenuDish",
  command: "add",
  route: "/api/manifest/MenuDish/commands/add",
  instanceCommand: true,
  clientParameterNames: ["menuId","dishId","sortOrder","course","serviceStyle","specialInstructions"],
  serverParameterNames: [],
  emits: ["MenuDishAdded"],
} as const;

/**
 * Build command input for MenuDish.add.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindMenuDishAddInput(client: MenuDishAddClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful MenuDish.add. */
export const MenuDishAddInvalidation = [
  {
    "kind": "entityList",
    "entity": "MenuDish",
    "queryKeyHint": "queryKeys.menuDish.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "MenuDish",
    "queryKeyHint": "queryKeys.menuDish.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- MenuDish.remove ---
export interface MenuDishRemoveClientInput {
  reason: string;
}

export const MenuDishRemoveCapability = {
  capabilityId: "MenuDish.remove",
  entity: "MenuDish",
  command: "remove",
  route: "/api/manifest/MenuDish/commands/remove",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["MenuDishRemoved"],
} as const;

/**
 * Build command input for MenuDish.remove.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindMenuDishRemoveInput(client: MenuDishRemoveClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful MenuDish.remove. */
export const MenuDishRemoveInvalidation = [
  {
    "kind": "entityList",
    "entity": "MenuDish",
    "queryKeyHint": "queryKeys.menuDish.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "MenuDish",
    "queryKeyHint": "queryKeys.menuDish.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- MenuDish.updateDetails ---
export interface MenuDishUpdateDetailsClientInput {
  sortOrder?: number;
  course?: string;
  serviceStyle?: string;
  specialInstructions?: string;
}

export const MenuDishUpdateDetailsCapability = {
  capabilityId: "MenuDish.updateDetails",
  entity: "MenuDish",
  command: "updateDetails",
  route: "/api/manifest/MenuDish/commands/updateDetails",
  instanceCommand: true,
  clientParameterNames: ["sortOrder","course","serviceStyle","specialInstructions"],
  serverParameterNames: [],
  emits: ["MenuDishDetailsUpdated"],
} as const;

/**
 * Build command input for MenuDish.updateDetails.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindMenuDishUpdateDetailsInput(client: MenuDishUpdateDetailsClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful MenuDish.updateDetails. */
export const MenuDishUpdateDetailsInvalidation = [
  {
    "kind": "entityList",
    "entity": "MenuDish",
    "queryKeyHint": "queryKeys.menuDish.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "MenuDish",
    "queryKeyHint": "queryKeys.menuDish.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Organization.deactivate ---
export type OrganizationDeactivateClientInput = Record<string, never>;

export const OrganizationDeactivateCapability = {
  capabilityId: "Organization.deactivate",
  entity: "Organization",
  command: "deactivate",
  route: "/api/manifest/Organization/commands/deactivate",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["OrganizationDeactivated"],
} as const;

/**
 * Build command input for Organization.deactivate.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindOrganizationDeactivateInput(client: OrganizationDeactivateClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Organization.deactivate. */
export const OrganizationDeactivateInvalidation = [
  {
    "kind": "entityList",
    "entity": "Organization",
    "queryKeyHint": "queryKeys.organization.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Organization",
    "queryKeyHint": "queryKeys.organization.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Organization.deactivate. */
export const OrganizationDeactivateLifecycle = [
  {
    "property": "status",
    "from": "active",
    "to": "deactivated",
    "proven": true
  },
  {
    "property": "status",
    "from": "suspended",
    "to": "deactivated",
    "proven": true
  }
] as const;

// --- Organization.reactivate ---
export type OrganizationReactivateClientInput = Record<string, never>;

export const OrganizationReactivateCapability = {
  capabilityId: "Organization.reactivate",
  entity: "Organization",
  command: "reactivate",
  route: "/api/manifest/Organization/commands/reactivate",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["OrganizationReactivated"],
} as const;

/**
 * Build command input for Organization.reactivate.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindOrganizationReactivateInput(client: OrganizationReactivateClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Organization.reactivate. */
export const OrganizationReactivateInvalidation = [
  {
    "kind": "entityList",
    "entity": "Organization",
    "queryKeyHint": "queryKeys.organization.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Organization",
    "queryKeyHint": "queryKeys.organization.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Organization.reactivate. */
export const OrganizationReactivateLifecycle = [
  {
    "property": "status",
    "from": "suspended",
    "to": "active",
    "proven": true
  }
] as const;

// --- Organization.register ---
export interface OrganizationRegisterClientInput {
  name: string;
}

export const OrganizationRegisterCapability = {
  capabilityId: "Organization.register",
  entity: "Organization",
  command: "register",
  route: "/api/manifest/Organization/commands/register",
  instanceCommand: true,
  clientParameterNames: ["name"],
  serverParameterNames: [],
  emits: ["OrganizationRegistered"],
} as const;

/**
 * Build command input for Organization.register.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindOrganizationRegisterInput(client: OrganizationRegisterClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Organization.register. */
export const OrganizationRegisterInvalidation = [
  {
    "kind": "entityList",
    "entity": "Organization",
    "queryKeyHint": "queryKeys.organization.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Organization",
    "queryKeyHint": "queryKeys.organization.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Organization.rename ---
export interface OrganizationRenameClientInput {
  name: string;
}

export const OrganizationRenameCapability = {
  capabilityId: "Organization.rename",
  entity: "Organization",
  command: "rename",
  route: "/api/manifest/Organization/commands/rename",
  instanceCommand: true,
  clientParameterNames: ["name"],
  serverParameterNames: [],
  emits: ["OrganizationRenamed"],
} as const;

/**
 * Build command input for Organization.rename.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindOrganizationRenameInput(client: OrganizationRenameClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Organization.rename. */
export const OrganizationRenameInvalidation = [
  {
    "kind": "entityList",
    "entity": "Organization",
    "queryKeyHint": "queryKeys.organization.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Organization",
    "queryKeyHint": "queryKeys.organization.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Organization.suspend ---
export interface OrganizationSuspendClientInput {
  reason?: string;
}

export const OrganizationSuspendCapability = {
  capabilityId: "Organization.suspend",
  entity: "Organization",
  command: "suspend",
  route: "/api/manifest/Organization/commands/suspend",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["OrganizationSuspended"],
} as const;

/**
 * Build command input for Organization.suspend.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindOrganizationSuspendInput(client: OrganizationSuspendClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Organization.suspend. */
export const OrganizationSuspendInvalidation = [
  {
    "kind": "entityList",
    "entity": "Organization",
    "queryKeyHint": "queryKeys.organization.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Organization",
    "queryKeyHint": "queryKeys.organization.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Organization.suspend. */
export const OrganizationSuspendLifecycle = [
  {
    "property": "status",
    "from": "active",
    "to": "suspended",
    "proven": true
  }
] as const;

// --- PackList.cancel ---
export interface PackListCancelClientInput {
  reason: string;
}

export const PackListCancelCapability = {
  capabilityId: "PackList.cancel",
  entity: "PackList",
  command: "cancel",
  route: "/api/manifest/PackList/commands/cancel",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["PackListCancelled"],
} as const;

/**
 * Build command input for PackList.cancel.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPackListCancelInput(client: PackListCancelClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PackList.cancel. */
export const PackListCancelInvalidation = [
  {
    "kind": "entityList",
    "entity": "PackList",
    "queryKeyHint": "queryKeys.packList.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PackList",
    "queryKeyHint": "queryKeys.packList.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for PackList.cancel. */
export const PackListCancelLifecycle = [
  {
    "property": "status",
    "from": "draft",
    "to": "cancelled",
    "proven": true
  },
  {
    "property": "status",
    "from": "packing",
    "to": "cancelled",
    "proven": true
  },
  {
    "property": "status",
    "from": "packed",
    "to": "cancelled",
    "proven": true
  },
  {
    "property": "status",
    "from": "loaded",
    "to": "cancelled",
    "proven": true
  }
] as const;

// --- PackList.dispatch ---
export type PackListDispatchClientInput = Record<string, never>;

export const PackListDispatchCapability = {
  capabilityId: "PackList.dispatch",
  entity: "PackList",
  command: "dispatch",
  route: "/api/manifest/PackList/commands/dispatch",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["PackListDispatched"],
} as const;

/**
 * Build command input for PackList.dispatch.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPackListDispatchInput(client: PackListDispatchClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PackList.dispatch. */
export const PackListDispatchInvalidation = [
  {
    "kind": "entityList",
    "entity": "PackList",
    "queryKeyHint": "queryKeys.packList.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PackList",
    "queryKeyHint": "queryKeys.packList.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for PackList.dispatch. */
export const PackListDispatchLifecycle = [
  {
    "property": "status",
    "from": "loaded",
    "to": "dispatched",
    "proven": true
  }
] as const;

// --- PackList.markLoaded ---
export type PackListMarkLoadedClientInput = Record<string, never>;

export const PackListMarkLoadedCapability = {
  capabilityId: "PackList.markLoaded",
  entity: "PackList",
  command: "markLoaded",
  route: "/api/manifest/PackList/commands/markLoaded",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["PackListLoaded"],
} as const;

/**
 * Build command input for PackList.markLoaded.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPackListMarkLoadedInput(client: PackListMarkLoadedClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PackList.markLoaded. */
export const PackListMarkLoadedInvalidation = [
  {
    "kind": "entityList",
    "entity": "PackList",
    "queryKeyHint": "queryKeys.packList.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PackList",
    "queryKeyHint": "queryKeys.packList.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for PackList.markLoaded. */
export const PackListMarkLoadedLifecycle = [
  {
    "property": "status",
    "from": "packed",
    "to": "loaded",
    "proven": true
  }
] as const;

// --- PackList.markPacked ---
export type PackListMarkPackedClientInput = Record<string, never>;

export const PackListMarkPackedCapability = {
  capabilityId: "PackList.markPacked",
  entity: "PackList",
  command: "markPacked",
  route: "/api/manifest/PackList/commands/markPacked",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["PackListPacked"],
} as const;

/**
 * Build command input for PackList.markPacked.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPackListMarkPackedInput(client: PackListMarkPackedClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PackList.markPacked. */
export const PackListMarkPackedInvalidation = [
  {
    "kind": "entityList",
    "entity": "PackList",
    "queryKeyHint": "queryKeys.packList.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PackList",
    "queryKeyHint": "queryKeys.packList.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for PackList.markPacked. */
export const PackListMarkPackedLifecycle = [
  {
    "property": "status",
    "from": "packing",
    "to": "packed",
    "proven": true
  }
] as const;

// --- PackList.open ---
export interface PackListOpenClientInput {
  eventId: string;
  name: string;
  purpose?: string;
  notes?: string;
}

export const PackListOpenCapability = {
  capabilityId: "PackList.open",
  entity: "PackList",
  command: "open",
  route: "/api/manifest/PackList/commands/open",
  instanceCommand: true,
  clientParameterNames: ["eventId","name","purpose","notes"],
  serverParameterNames: [],
  emits: ["PackListOpened"],
} as const;

/**
 * Build command input for PackList.open.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPackListOpenInput(client: PackListOpenClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PackList.open. */
export const PackListOpenInvalidation = [
  {
    "kind": "entityList",
    "entity": "PackList",
    "queryKeyHint": "queryKeys.packList.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PackList",
    "queryKeyHint": "queryKeys.packList.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- PackList.startPacking ---
export type PackListStartPackingClientInput = Record<string, never>;

export const PackListStartPackingCapability = {
  capabilityId: "PackList.startPacking",
  entity: "PackList",
  command: "startPacking",
  route: "/api/manifest/PackList/commands/startPacking",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["PackListPackingStarted"],
} as const;

/**
 * Build command input for PackList.startPacking.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPackListStartPackingInput(client: PackListStartPackingClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PackList.startPacking. */
export const PackListStartPackingInvalidation = [
  {
    "kind": "entityList",
    "entity": "PackList",
    "queryKeyHint": "queryKeys.packList.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PackList",
    "queryKeyHint": "queryKeys.packList.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for PackList.startPacking. */
export const PackListStartPackingLifecycle = [
  {
    "property": "status",
    "from": "draft",
    "to": "packing",
    "proven": true
  }
] as const;

// --- PackListItem.addItem ---
export interface PackListItemAddItemClientInput {
  packListId: string;
  description: string;
  /** Bounds: 1..∞ */
  requiredQuantity: number;
  /** Allowed: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion" */
  unit: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion";
  dishId?: string;
  productionBatchId?: string;
}

export const PackListItemAddItemCapability = {
  capabilityId: "PackListItem.addItem",
  entity: "PackListItem",
  command: "addItem",
  route: "/api/manifest/PackListItem/commands/addItem",
  instanceCommand: true,
  clientParameterNames: ["packListId","description","requiredQuantity","unit","dishId","productionBatchId"],
  serverParameterNames: [],
  emits: ["PackListItemAdded"],
} as const;

/**
 * Build command input for PackListItem.addItem.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPackListItemAddItemInput(client: PackListItemAddItemClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PackListItem.addItem. */
export const PackListItemAddItemInvalidation = [
  {
    "kind": "entityList",
    "entity": "PackListItem",
    "queryKeyHint": "queryKeys.packListItem.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PackListItem",
    "queryKeyHint": "queryKeys.packListItem.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for PackListItem.addItem. */
export const PackListItemAddItemLifecycle = [
  {
    "property": "status",
    "from": "pending",
    "to": "listed",
    "proven": true
  }
] as const;

// --- PackListItem.adjustQuantity ---
export interface PackListItemAdjustQuantityClientInput {
  /** Bounds: 1..∞ */
  requiredQuantity: number;
}

export const PackListItemAdjustQuantityCapability = {
  capabilityId: "PackListItem.adjustQuantity",
  entity: "PackListItem",
  command: "adjustQuantity",
  route: "/api/manifest/PackListItem/commands/adjustQuantity",
  instanceCommand: true,
  clientParameterNames: ["requiredQuantity"],
  serverParameterNames: [],
  emits: ["PackListItemQuantityAdjusted"],
} as const;

/**
 * Build command input for PackListItem.adjustQuantity.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPackListItemAdjustQuantityInput(client: PackListItemAdjustQuantityClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PackListItem.adjustQuantity. */
export const PackListItemAdjustQuantityInvalidation = [
  {
    "kind": "entityList",
    "entity": "PackListItem",
    "queryKeyHint": "queryKeys.packListItem.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PackListItem",
    "queryKeyHint": "queryKeys.packListItem.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- PackListItem.markMissing ---
export type PackListItemMarkMissingClientInput = Record<string, never>;

export const PackListItemMarkMissingCapability = {
  capabilityId: "PackListItem.markMissing",
  entity: "PackListItem",
  command: "markMissing",
  route: "/api/manifest/PackListItem/commands/markMissing",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["PackListItemMissing"],
} as const;

/**
 * Build command input for PackListItem.markMissing.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPackListItemMarkMissingInput(client: PackListItemMarkMissingClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PackListItem.markMissing. */
export const PackListItemMarkMissingInvalidation = [
  {
    "kind": "entityList",
    "entity": "PackListItem",
    "queryKeyHint": "queryKeys.packListItem.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PackListItem",
    "queryKeyHint": "queryKeys.packListItem.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for PackListItem.markMissing. */
export const PackListItemMarkMissingLifecycle = [
  {
    "property": "status",
    "from": "listed",
    "to": "missing",
    "proven": true
  }
] as const;

// --- PackListItem.markPacked ---
export interface PackListItemMarkPackedClientInput {
  /** Bounds: 1..∞ */
  packedQuantity: number;
}

export const PackListItemMarkPackedCapability = {
  capabilityId: "PackListItem.markPacked",
  entity: "PackListItem",
  command: "markPacked",
  route: "/api/manifest/PackListItem/commands/markPacked",
  instanceCommand: true,
  clientParameterNames: ["packedQuantity"],
  serverParameterNames: [],
  emits: ["PackListItemPacked"],
} as const;

/**
 * Build command input for PackListItem.markPacked.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPackListItemMarkPackedInput(client: PackListItemMarkPackedClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PackListItem.markPacked. */
export const PackListItemMarkPackedInvalidation = [
  {
    "kind": "entityList",
    "entity": "PackListItem",
    "queryKeyHint": "queryKeys.packListItem.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PackListItem",
    "queryKeyHint": "queryKeys.packListItem.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for PackListItem.markPacked. */
export const PackListItemMarkPackedLifecycle = [
  {
    "property": "status",
    "from": "listed",
    "to": "packed",
    "proven": true
  }
] as const;

// --- Payment.beginProcessing ---
export type PaymentBeginProcessingClientInput = Record<string, never>;

export const PaymentBeginProcessingCapability = {
  capabilityId: "Payment.beginProcessing",
  entity: "Payment",
  command: "beginProcessing",
  route: "/api/manifest/Payment/commands/beginProcessing",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["PaymentProcessingStarted"],
} as const;

/**
 * Build command input for Payment.beginProcessing.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPaymentBeginProcessingInput(client: PaymentBeginProcessingClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Payment.beginProcessing. */
export const PaymentBeginProcessingInvalidation = [
  {
    "kind": "entityList",
    "entity": "Payment",
    "queryKeyHint": "queryKeys.payment.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Payment",
    "queryKeyHint": "queryKeys.payment.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Payment.beginProcessing. */
export const PaymentBeginProcessingLifecycle = [
  {
    "property": "status",
    "from": "pending",
    "to": "processing",
    "proven": true
  }
] as const;

// --- Payment.fail ---
export interface PaymentFailClientInput {
  reason: string;
}

export const PaymentFailCapability = {
  capabilityId: "Payment.fail",
  entity: "Payment",
  command: "fail",
  route: "/api/manifest/Payment/commands/fail",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["PaymentFailed"],
} as const;

/**
 * Build command input for Payment.fail.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPaymentFailInput(client: PaymentFailClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Payment.fail. */
export const PaymentFailInvalidation = [
  {
    "kind": "entityList",
    "entity": "Payment",
    "queryKeyHint": "queryKeys.payment.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Payment",
    "queryKeyHint": "queryKeys.payment.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Payment.fail. */
export const PaymentFailLifecycle = [
  {
    "property": "status",
    "from": "pending",
    "to": "failed",
    "proven": true
  },
  {
    "property": "status",
    "from": "processing",
    "to": "failed",
    "proven": true
  }
] as const;

// --- Payment.record ---
export interface PaymentRecordClientInput {
  invoiceId: string;
  clientId: string;
  /** Bounds: 1..∞ */
  amount: number;
  /** Allowed: "card" | "check" | "cash" | "ach" | "other" */
  method: "card" | "check" | "cash" | "ach" | "other";
  eventId?: string;
  paymentMethodId?: string;
  notes?: string;
}

export const PaymentRecordCapability = {
  capabilityId: "Payment.record",
  entity: "Payment",
  command: "record",
  route: "/api/manifest/Payment/commands/record",
  instanceCommand: true,
  clientParameterNames: ["invoiceId","clientId","amount","method","eventId","paymentMethodId","notes"],
  serverParameterNames: [],
  emits: ["PaymentRecorded"],
} as const;

/**
 * Build command input for Payment.record.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPaymentRecordInput(client: PaymentRecordClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Payment.record. */
export const PaymentRecordInvalidation = [
  {
    "kind": "entityList",
    "entity": "Payment",
    "queryKeyHint": "queryKeys.payment.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Payment",
    "queryKeyHint": "queryKeys.payment.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Payment.refund ---
export interface PaymentRefundClientInput {
  reason: string;
}

export const PaymentRefundCapability = {
  capabilityId: "Payment.refund",
  entity: "Payment",
  command: "refund",
  route: "/api/manifest/Payment/commands/refund",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["PaymentRefunded"],
} as const;

/**
 * Build command input for Payment.refund.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPaymentRefundInput(client: PaymentRefundClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Payment.refund. */
export const PaymentRefundInvalidation = [
  {
    "kind": "entityList",
    "entity": "Payment",
    "queryKeyHint": "queryKeys.payment.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Payment",
    "queryKeyHint": "queryKeys.payment.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Payment.refund. */
export const PaymentRefundLifecycle = [
  {
    "property": "status",
    "from": "completed",
    "to": "refunded",
    "proven": true
  }
] as const;

// --- Payment.settle ---
export type PaymentSettleClientInput = Record<string, never>;

export const PaymentSettleCapability = {
  capabilityId: "Payment.settle",
  entity: "Payment",
  command: "settle",
  route: "/api/manifest/Payment/commands/settle",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["PaymentSettled"],
} as const;

/**
 * Build command input for Payment.settle.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPaymentSettleInput(client: PaymentSettleClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Payment.settle. */
export const PaymentSettleInvalidation = [
  {
    "kind": "entityList",
    "entity": "Payment",
    "queryKeyHint": "queryKeys.payment.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Payment",
    "queryKeyHint": "queryKeys.payment.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Payment.settle. */
export const PaymentSettleLifecycle = [
  {
    "property": "status",
    "from": "pending",
    "to": "completed",
    "proven": true
  },
  {
    "property": "status",
    "from": "processing",
    "to": "completed",
    "proven": true
  }
] as const;

// --- PaymentMethod.clearDefault ---
export type PaymentMethodClearDefaultClientInput = Record<string, never>;

export const PaymentMethodClearDefaultCapability = {
  capabilityId: "PaymentMethod.clearDefault",
  entity: "PaymentMethod",
  command: "clearDefault",
  route: "/api/manifest/PaymentMethod/commands/clearDefault",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["PaymentMethodDefaultCleared"],
} as const;

/**
 * Build command input for PaymentMethod.clearDefault.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPaymentMethodClearDefaultInput(client: PaymentMethodClearDefaultClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PaymentMethod.clearDefault. */
export const PaymentMethodClearDefaultInvalidation = [
  {
    "kind": "entityList",
    "entity": "PaymentMethod",
    "queryKeyHint": "queryKeys.paymentMethod.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PaymentMethod",
    "queryKeyHint": "queryKeys.paymentMethod.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- PaymentMethod.expire ---
export type PaymentMethodExpireClientInput = Record<string, never>;

export const PaymentMethodExpireCapability = {
  capabilityId: "PaymentMethod.expire",
  entity: "PaymentMethod",
  command: "expire",
  route: "/api/manifest/PaymentMethod/commands/expire",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["PaymentMethodExpired"],
} as const;

/**
 * Build command input for PaymentMethod.expire.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPaymentMethodExpireInput(client: PaymentMethodExpireClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PaymentMethod.expire. */
export const PaymentMethodExpireInvalidation = [
  {
    "kind": "entityList",
    "entity": "PaymentMethod",
    "queryKeyHint": "queryKeys.paymentMethod.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PaymentMethod",
    "queryKeyHint": "queryKeys.paymentMethod.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for PaymentMethod.expire. */
export const PaymentMethodExpireLifecycle = [
  {
    "property": "status",
    "from": "active",
    "to": "expired",
    "proven": true
  }
] as const;

// --- PaymentMethod.invalidate ---
export interface PaymentMethodInvalidateClientInput {
  reason: string;
}

export const PaymentMethodInvalidateCapability = {
  capabilityId: "PaymentMethod.invalidate",
  entity: "PaymentMethod",
  command: "invalidate",
  route: "/api/manifest/PaymentMethod/commands/invalidate",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["PaymentMethodInvalidated"],
} as const;

/**
 * Build command input for PaymentMethod.invalidate.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPaymentMethodInvalidateInput(client: PaymentMethodInvalidateClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PaymentMethod.invalidate. */
export const PaymentMethodInvalidateInvalidation = [
  {
    "kind": "entityList",
    "entity": "PaymentMethod",
    "queryKeyHint": "queryKeys.paymentMethod.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PaymentMethod",
    "queryKeyHint": "queryKeys.paymentMethod.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for PaymentMethod.invalidate. */
export const PaymentMethodInvalidateLifecycle = [
  {
    "property": "status",
    "from": "active",
    "to": "invalid",
    "proven": true
  }
] as const;

// --- PaymentMethod.makeDefault ---
export type PaymentMethodMakeDefaultClientInput = Record<string, never>;

export const PaymentMethodMakeDefaultCapability = {
  capabilityId: "PaymentMethod.makeDefault",
  entity: "PaymentMethod",
  command: "makeDefault",
  route: "/api/manifest/PaymentMethod/commands/makeDefault",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["PaymentMethodDefaultSet"],
} as const;

/**
 * Build command input for PaymentMethod.makeDefault.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPaymentMethodMakeDefaultInput(client: PaymentMethodMakeDefaultClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PaymentMethod.makeDefault. */
export const PaymentMethodMakeDefaultInvalidation = [
  {
    "kind": "entityList",
    "entity": "PaymentMethod",
    "queryKeyHint": "queryKeys.paymentMethod.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PaymentMethod",
    "queryKeyHint": "queryKeys.paymentMethod.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- PaymentMethod.reactivate ---
export type PaymentMethodReactivateClientInput = Record<string, never>;

export const PaymentMethodReactivateCapability = {
  capabilityId: "PaymentMethod.reactivate",
  entity: "PaymentMethod",
  command: "reactivate",
  route: "/api/manifest/PaymentMethod/commands/reactivate",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["PaymentMethodReactivated"],
} as const;

/**
 * Build command input for PaymentMethod.reactivate.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPaymentMethodReactivateInput(client: PaymentMethodReactivateClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PaymentMethod.reactivate. */
export const PaymentMethodReactivateInvalidation = [
  {
    "kind": "entityList",
    "entity": "PaymentMethod",
    "queryKeyHint": "queryKeys.paymentMethod.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PaymentMethod",
    "queryKeyHint": "queryKeys.paymentMethod.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for PaymentMethod.reactivate. */
export const PaymentMethodReactivateLifecycle = [
  {
    "property": "status",
    "from": "expired",
    "to": "active",
    "proven": true
  }
] as const;

// --- PaymentMethod.register ---
export interface PaymentMethodRegisterClientInput {
  clientId: string;
  /** Allowed: "card" | "check" | "cash" | "ach" | "other" */
  methodType: "card" | "check" | "cash" | "ach" | "other";
  provider?: string;
  lastFour?: string;
  isDefault?: boolean;
  notes?: string;
}

export const PaymentMethodRegisterCapability = {
  capabilityId: "PaymentMethod.register",
  entity: "PaymentMethod",
  command: "register",
  route: "/api/manifest/PaymentMethod/commands/register",
  instanceCommand: true,
  clientParameterNames: ["clientId","methodType","provider","lastFour","isDefault","notes"],
  serverParameterNames: [],
  emits: ["PaymentMethodRegistered"],
} as const;

/**
 * Build command input for PaymentMethod.register.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPaymentMethodRegisterInput(client: PaymentMethodRegisterClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PaymentMethod.register. */
export const PaymentMethodRegisterInvalidation = [
  {
    "kind": "entityList",
    "entity": "PaymentMethod",
    "queryKeyHint": "queryKeys.paymentMethod.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PaymentMethod",
    "queryKeyHint": "queryKeys.paymentMethod.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- PaymentMethod.remove ---
export type PaymentMethodRemoveClientInput = Record<string, never>;

export const PaymentMethodRemoveCapability = {
  capabilityId: "PaymentMethod.remove",
  entity: "PaymentMethod",
  command: "remove",
  route: "/api/manifest/PaymentMethod/commands/remove",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["PaymentMethodRemoved"],
} as const;

/**
 * Build command input for PaymentMethod.remove.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPaymentMethodRemoveInput(client: PaymentMethodRemoveClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PaymentMethod.remove. */
export const PaymentMethodRemoveInvalidation = [
  {
    "kind": "entityList",
    "entity": "PaymentMethod",
    "queryKeyHint": "queryKeys.paymentMethod.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PaymentMethod",
    "queryKeyHint": "queryKeys.paymentMethod.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for PaymentMethod.remove. */
export const PaymentMethodRemoveLifecycle = [
  {
    "property": "status",
    "from": "active",
    "to": "removed",
    "proven": true
  }
] as const;

// --- PayrollInput.finalize ---
export type PayrollInputFinalizeClientInput = Record<string, never>;

export const PayrollInputFinalizeCapability = {
  capabilityId: "PayrollInput.finalize",
  entity: "PayrollInput",
  command: "finalize",
  route: "/api/manifest/PayrollInput/commands/finalize",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["PayrollInputFinalized"],
} as const;

/**
 * Build command input for PayrollInput.finalize.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPayrollInputFinalizeInput(client: PayrollInputFinalizeClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PayrollInput.finalize. */
export const PayrollInputFinalizeInvalidation = [
  {
    "kind": "entityList",
    "entity": "PayrollInput",
    "queryKeyHint": "queryKeys.payrollInput.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PayrollInput",
    "queryKeyHint": "queryKeys.payrollInput.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for PayrollInput.finalize. */
export const PayrollInputFinalizeLifecycle = [
  {
    "property": "status",
    "from": "prepared",
    "to": "finalized",
    "proven": true
  }
] as const;

// --- PayrollInput.markVoided ---
export interface PayrollInputMarkVoidedClientInput {
  reason: string;
}

export const PayrollInputMarkVoidedCapability = {
  capabilityId: "PayrollInput.markVoided",
  entity: "PayrollInput",
  command: "markVoided",
  route: "/api/manifest/PayrollInput/commands/markVoided",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["PayrollInputVoided"],
} as const;

/**
 * Build command input for PayrollInput.markVoided.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPayrollInputMarkVoidedInput(client: PayrollInputMarkVoidedClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PayrollInput.markVoided. */
export const PayrollInputMarkVoidedInvalidation = [
  {
    "kind": "entityList",
    "entity": "PayrollInput",
    "queryKeyHint": "queryKeys.payrollInput.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PayrollInput",
    "queryKeyHint": "queryKeys.payrollInput.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for PayrollInput.markVoided. */
export const PayrollInputMarkVoidedLifecycle = [
  {
    "property": "status",
    "from": "draft",
    "to": "voided",
    "proven": true
  },
  {
    "property": "status",
    "from": "prepared",
    "to": "voided",
    "proven": true
  },
  {
    "property": "status",
    "from": "finalized",
    "to": "voided",
    "proven": true
  }
] as const;

// --- PayrollInput.prepare ---
export interface PayrollInputPrepareClientInput {
  personId: string;
  /** Must not be "". */
  periodStart: string & { readonly __nonEmpty?: true };
  /** Must not be "". */
  periodEnd: string & { readonly __nonEmpty?: true };
  /** Bounds: 0..∞ */
  regularMinutes: number;
  /** Bounds: 0..∞ */
  overtimeMinutes: number;
  /** Bounds: 0..∞ */
  totalMinutes: number;
  eventId?: string;
  shiftId?: string;
  /** Bounds: 0..∞ */
  hourlyRate?: number;
  /** Bounds: 0..∞ */
  overtimeRate?: number;
  /** Bounds: 0..∞ */
  grossAmount?: number;
  notes?: string;
}

export const PayrollInputPrepareCapability = {
  capabilityId: "PayrollInput.prepare",
  entity: "PayrollInput",
  command: "prepare",
  route: "/api/manifest/PayrollInput/commands/prepare",
  instanceCommand: true,
  clientParameterNames: ["personId","periodStart","periodEnd","regularMinutes","overtimeMinutes","totalMinutes","eventId","shiftId","hourlyRate","overtimeRate","grossAmount","notes"],
  serverParameterNames: [],
  emits: ["PayrollInputPrepared"],
} as const;

/**
 * Build command input for PayrollInput.prepare.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPayrollInputPrepareInput(client: PayrollInputPrepareClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PayrollInput.prepare. */
export const PayrollInputPrepareInvalidation = [
  {
    "kind": "entityList",
    "entity": "PayrollInput",
    "queryKeyHint": "queryKeys.payrollInput.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PayrollInput",
    "queryKeyHint": "queryKeys.payrollInput.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for PayrollInput.prepare. */
export const PayrollInputPrepareLifecycle = [
  {
    "property": "status",
    "from": "draft",
    "to": "prepared",
    "proven": true
  }
] as const;

// --- Person.assignRole ---
export interface PersonAssignRoleClientInput {
  /** Allowed: "staff" | "kitchen_staff" | "kitchen_lead" | "sales_staff" | "event_staff" | "inventory_staff" | "procurement_staff" | "logistics_staff" | "driver" | "workforce_staff" | "finance_staff" | "manager" | "kitchen_manager" | "sales_manager" | "event_manager" | "inventory_manager" | "logistics_manager" | "workforce_manager" | "finance_manager" | "admin" | "owner" | "system" */
  role: "staff" | "kitchen_staff" | "kitchen_lead" | "sales_staff" | "event_staff" | "inventory_staff" | "procurement_staff" | "logistics_staff" | "driver" | "workforce_staff" | "finance_staff" | "manager" | "kitchen_manager" | "sales_manager" | "event_manager" | "inventory_manager" | "logistics_manager" | "workforce_manager" | "finance_manager" | "admin" | "owner" | "system";
}

export const PersonAssignRoleCapability = {
  capabilityId: "Person.assignRole",
  entity: "Person",
  command: "assignRole",
  route: "/api/manifest/Person/commands/assignRole",
  instanceCommand: true,
  clientParameterNames: ["role"],
  serverParameterNames: [],
  emits: ["PersonRoleAssigned"],
} as const;

/**
 * Build command input for Person.assignRole.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPersonAssignRoleInput(client: PersonAssignRoleClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Person.assignRole. */
export const PersonAssignRoleInvalidation = [
  {
    "kind": "entityList",
    "entity": "Person",
    "queryKeyHint": "queryKeys.person.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Person",
    "queryKeyHint": "queryKeys.person.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Person.correctIdentity ---
export interface PersonCorrectIdentityClientInput {
  givenName: string;
  familyName: string;
  phone?: string;
}

export const PersonCorrectIdentityCapability = {
  capabilityId: "Person.correctIdentity",
  entity: "Person",
  command: "correctIdentity",
  route: "/api/manifest/Person/commands/correctIdentity",
  instanceCommand: true,
  clientParameterNames: ["givenName","familyName","phone"],
  serverParameterNames: [],
  emits: ["PersonIdentityCorrected"],
} as const;

/**
 * Build command input for Person.correctIdentity.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPersonCorrectIdentityInput(client: PersonCorrectIdentityClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Person.correctIdentity. */
export const PersonCorrectIdentityInvalidation = [
  {
    "kind": "entityList",
    "entity": "Person",
    "queryKeyHint": "queryKeys.person.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Person",
    "queryKeyHint": "queryKeys.person.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Person.deactivate ---
export type PersonDeactivateClientInput = Record<string, never>;

export const PersonDeactivateCapability = {
  capabilityId: "Person.deactivate",
  entity: "Person",
  command: "deactivate",
  route: "/api/manifest/Person/commands/deactivate",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["PersonDeactivated"],
} as const;

/**
 * Build command input for Person.deactivate.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPersonDeactivateInput(client: PersonDeactivateClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Person.deactivate. */
export const PersonDeactivateInvalidation = [
  {
    "kind": "entityList",
    "entity": "Person",
    "queryKeyHint": "queryKeys.person.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Person",
    "queryKeyHint": "queryKeys.person.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Person.deactivate. */
export const PersonDeactivateLifecycle = [
  {
    "property": "status",
    "from": "active",
    "to": "inactive",
    "proven": true
  }
] as const;

// --- Person.hire ---
export interface PersonHireClientInput {
  givenName: string;
  familyName: string;
  email: string;
  phone?: string;
  /** Allowed: "staff" | "kitchen_staff" | "kitchen_lead" | "sales_staff" | "event_staff" | "inventory_staff" | "procurement_staff" | "logistics_staff" | "driver" | "workforce_staff" | "finance_staff" | "manager" | "kitchen_manager" | "sales_manager" | "event_manager" | "inventory_manager" | "logistics_manager" | "workforce_manager" | "finance_manager" | "admin" | "owner" | "system" */
  role?: "staff" | "kitchen_staff" | "kitchen_lead" | "sales_staff" | "event_staff" | "inventory_staff" | "procurement_staff" | "logistics_staff" | "driver" | "workforce_staff" | "finance_staff" | "manager" | "kitchen_manager" | "sales_manager" | "event_manager" | "inventory_manager" | "logistics_manager" | "workforce_manager" | "finance_manager" | "admin" | "owner" | "system";
  /** Allowed: "full_time" | "part_time" | "contractor" | "temporary" */
  employmentType?: "full_time" | "part_time" | "contractor" | "temporary";
  employeeNumber?: string;
  authSubjectId?: string;
}

export const PersonHireCapability = {
  capabilityId: "Person.hire",
  entity: "Person",
  command: "hire",
  route: "/api/manifest/Person/commands/hire",
  instanceCommand: true,
  clientParameterNames: ["givenName","familyName","email","phone","role","employmentType","employeeNumber","authSubjectId"],
  serverParameterNames: [],
  emits: ["PersonHired"],
} as const;

/**
 * Build command input for Person.hire.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPersonHireInput(client: PersonHireClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Person.hire. */
export const PersonHireInvalidation = [
  {
    "kind": "entityList",
    "entity": "Person",
    "queryKeyHint": "queryKeys.person.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Person",
    "queryKeyHint": "queryKeys.person.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Person.reactivate ---
export type PersonReactivateClientInput = Record<string, never>;

export const PersonReactivateCapability = {
  capabilityId: "Person.reactivate",
  entity: "Person",
  command: "reactivate",
  route: "/api/manifest/Person/commands/reactivate",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["PersonReactivated"],
} as const;

/**
 * Build command input for Person.reactivate.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPersonReactivateInput(client: PersonReactivateClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Person.reactivate. */
export const PersonReactivateInvalidation = [
  {
    "kind": "entityList",
    "entity": "Person",
    "queryKeyHint": "queryKeys.person.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Person",
    "queryKeyHint": "queryKeys.person.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Person.reactivate. */
export const PersonReactivateLifecycle = [
  {
    "property": "status",
    "from": "inactive",
    "to": "active",
    "proven": true
  }
] as const;

// --- Person.terminate ---
export interface PersonTerminateClientInput {
  reason?: string;
}

export const PersonTerminateCapability = {
  capabilityId: "Person.terminate",
  entity: "Person",
  command: "terminate",
  route: "/api/manifest/Person/commands/terminate",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["PersonTerminated"],
} as const;

/**
 * Build command input for Person.terminate.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPersonTerminateInput(client: PersonTerminateClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Person.terminate. */
export const PersonTerminateInvalidation = [
  {
    "kind": "entityList",
    "entity": "Person",
    "queryKeyHint": "queryKeys.person.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Person",
    "queryKeyHint": "queryKeys.person.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Person.terminate. */
export const PersonTerminateLifecycle = [
  {
    "property": "status",
    "from": "active",
    "to": "terminated",
    "proven": true
  },
  {
    "property": "status",
    "from": "inactive",
    "to": "terminated",
    "proven": true
  }
] as const;

// --- PrepTask.cancel ---
export interface PrepTaskCancelClientInput {
  reason: string;
}

export const PrepTaskCancelCapability = {
  capabilityId: "PrepTask.cancel",
  entity: "PrepTask",
  command: "cancel",
  route: "/api/manifest/PrepTask/commands/cancel",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["PrepTaskCancelled"],
} as const;

/**
 * Build command input for PrepTask.cancel.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPrepTaskCancelInput(client: PrepTaskCancelClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PrepTask.cancel. */
export const PrepTaskCancelInvalidation = [
  {
    "kind": "entityList",
    "entity": "PrepTask",
    "queryKeyHint": "queryKeys.prepTask.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PrepTask",
    "queryKeyHint": "queryKeys.prepTask.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for PrepTask.cancel. */
export const PrepTaskCancelLifecycle = [
  {
    "property": "status",
    "from": "pending",
    "to": "cancelled",
    "proven": true
  },
  {
    "property": "status",
    "from": "claimed",
    "to": "cancelled",
    "proven": true
  },
  {
    "property": "status",
    "from": "in_progress",
    "to": "cancelled",
    "proven": true
  },
  {
    "property": "status",
    "from": "blocked",
    "to": "cancelled",
    "proven": true
  }
] as const;

// --- PrepTask.claim ---
export type PrepTaskClaimClientInput = Record<string, never>;

export const PrepTaskClaimCapability = {
  capabilityId: "PrepTask.claim",
  entity: "PrepTask",
  command: "claim",
  route: "/api/manifest/PrepTask/commands/claim",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["PrepTaskClaimed"],
} as const;

/**
 * Build command input for PrepTask.claim.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPrepTaskClaimInput(client: PrepTaskClaimClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PrepTask.claim. */
export const PrepTaskClaimInvalidation = [
  {
    "kind": "entityList",
    "entity": "PrepTask",
    "queryKeyHint": "queryKeys.prepTask.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PrepTask",
    "queryKeyHint": "queryKeys.prepTask.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for PrepTask.claim. */
export const PrepTaskClaimLifecycle = [
  {
    "property": "status",
    "from": "pending",
    "to": "claimed",
    "proven": true
  }
] as const;

// --- PrepTask.complete ---
export interface PrepTaskCompleteClientInput {
  /** Bounds: 0..∞ */
  completedQuantity?: number;
}

export const PrepTaskCompleteCapability = {
  capabilityId: "PrepTask.complete",
  entity: "PrepTask",
  command: "complete",
  route: "/api/manifest/PrepTask/commands/complete",
  instanceCommand: true,
  clientParameterNames: ["completedQuantity"],
  serverParameterNames: [],
  emits: ["PrepTaskCompleted"],
} as const;

/**
 * Build command input for PrepTask.complete.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPrepTaskCompleteInput(client: PrepTaskCompleteClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PrepTask.complete. */
export const PrepTaskCompleteInvalidation = [
  {
    "kind": "entityList",
    "entity": "PrepTask",
    "queryKeyHint": "queryKeys.prepTask.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PrepTask",
    "queryKeyHint": "queryKeys.prepTask.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for PrepTask.complete. */
export const PrepTaskCompleteLifecycle = [
  {
    "property": "status",
    "from": "in_progress",
    "to": "completed",
    "proven": true
  }
] as const;

// --- PrepTask.markBlocked ---
export interface PrepTaskMarkBlockedClientInput {
  reason: string;
}

export const PrepTaskMarkBlockedCapability = {
  capabilityId: "PrepTask.markBlocked",
  entity: "PrepTask",
  command: "markBlocked",
  route: "/api/manifest/PrepTask/commands/markBlocked",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["PrepTaskBlocked"],
} as const;

/**
 * Build command input for PrepTask.markBlocked.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPrepTaskMarkBlockedInput(client: PrepTaskMarkBlockedClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PrepTask.markBlocked. */
export const PrepTaskMarkBlockedInvalidation = [
  {
    "kind": "entityList",
    "entity": "PrepTask",
    "queryKeyHint": "queryKeys.prepTask.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PrepTask",
    "queryKeyHint": "queryKeys.prepTask.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for PrepTask.markBlocked. */
export const PrepTaskMarkBlockedLifecycle = [
  {
    "property": "status",
    "from": "pending",
    "to": "blocked",
    "proven": true
  },
  {
    "property": "status",
    "from": "claimed",
    "to": "blocked",
    "proven": true
  },
  {
    "property": "status",
    "from": "in_progress",
    "to": "blocked",
    "proven": true
  }
] as const;

// --- PrepTask.open ---
export interface PrepTaskOpenClientInput {
  eventDishId: string;
  eventId: string;
  name: string;
  /** Bounds: 1..∞ */
  quantity: number;
  /** Allowed: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion" */
  unit: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion";
  ingredientId?: string;
  ingredientDemandId?: string;
  recipeId?: string;
  dishTaskId?: string;
  dishId?: string;
  category?: string;
  taskType?: string;
  specialInstructions?: string;
  isGenerated?: boolean;
  station?: string;
  dueAt?: string;
  notes?: string;
}

export const PrepTaskOpenCapability = {
  capabilityId: "PrepTask.open",
  entity: "PrepTask",
  command: "open",
  route: "/api/manifest/PrepTask/commands/open",
  instanceCommand: true,
  clientParameterNames: ["eventDishId","eventId","name","quantity","unit","ingredientId","ingredientDemandId","recipeId","dishTaskId","dishId","category","taskType","specialInstructions","isGenerated","station","dueAt","notes"],
  serverParameterNames: [],
  emits: ["PrepTaskOpened"],
} as const;

/**
 * Build command input for PrepTask.open.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPrepTaskOpenInput(client: PrepTaskOpenClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PrepTask.open. */
export const PrepTaskOpenInvalidation = [
  {
    "kind": "entityList",
    "entity": "PrepTask",
    "queryKeyHint": "queryKeys.prepTask.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PrepTask",
    "queryKeyHint": "queryKeys.prepTask.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- PrepTask.refreshGenerated ---
export interface PrepTaskRefreshGeneratedClientInput {
  /** Bounds: 1..∞ */
  quantity: number;
  specialInstructions?: string;
}

export const PrepTaskRefreshGeneratedCapability = {
  capabilityId: "PrepTask.refreshGenerated",
  entity: "PrepTask",
  command: "refreshGenerated",
  route: "/api/manifest/PrepTask/commands/refreshGenerated",
  instanceCommand: true,
  clientParameterNames: ["quantity","specialInstructions"],
  serverParameterNames: [],
  emits: ["PrepTaskGeneratedRefreshed"],
} as const;

/**
 * Build command input for PrepTask.refreshGenerated.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPrepTaskRefreshGeneratedInput(client: PrepTaskRefreshGeneratedClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PrepTask.refreshGenerated. */
export const PrepTaskRefreshGeneratedInvalidation = [
  {
    "kind": "entityList",
    "entity": "PrepTask",
    "queryKeyHint": "queryKeys.prepTask.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PrepTask",
    "queryKeyHint": "queryKeys.prepTask.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- PrepTask.release ---
export type PrepTaskReleaseClientInput = Record<string, never>;

export const PrepTaskReleaseCapability = {
  capabilityId: "PrepTask.release",
  entity: "PrepTask",
  command: "release",
  route: "/api/manifest/PrepTask/commands/release",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["PrepTaskReleased"],
} as const;

/**
 * Build command input for PrepTask.release.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPrepTaskReleaseInput(client: PrepTaskReleaseClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PrepTask.release. */
export const PrepTaskReleaseInvalidation = [
  {
    "kind": "entityList",
    "entity": "PrepTask",
    "queryKeyHint": "queryKeys.prepTask.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PrepTask",
    "queryKeyHint": "queryKeys.prepTask.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for PrepTask.release. */
export const PrepTaskReleaseLifecycle = [
  {
    "property": "status",
    "from": "claimed",
    "to": "pending",
    "proven": true
  },
  {
    "property": "status",
    "from": "blocked",
    "to": "pending",
    "proven": true
  }
] as const;

// --- PrepTask.revise ---
export interface PrepTaskReviseClientInput {
  name?: string;
  /** Bounds: 1..∞ */
  quantity?: number;
  /** Allowed: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion" */
  unit?: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion";
  category?: string;
  taskType?: string;
  specialInstructions?: string;
  ingredientId?: string;
  recipeId?: string;
}

export const PrepTaskReviseCapability = {
  capabilityId: "PrepTask.revise",
  entity: "PrepTask",
  command: "revise",
  route: "/api/manifest/PrepTask/commands/revise",
  instanceCommand: true,
  clientParameterNames: ["name","quantity","unit","category","taskType","specialInstructions","ingredientId","recipeId"],
  serverParameterNames: [],
  emits: ["PrepTaskRevised"],
} as const;

/**
 * Build command input for PrepTask.revise.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPrepTaskReviseInput(client: PrepTaskReviseClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PrepTask.revise. */
export const PrepTaskReviseInvalidation = [
  {
    "kind": "entityList",
    "entity": "PrepTask",
    "queryKeyHint": "queryKeys.prepTask.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PrepTask",
    "queryKeyHint": "queryKeys.prepTask.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- PrepTask.start ---
export type PrepTaskStartClientInput = Record<string, never>;

export const PrepTaskStartCapability = {
  capabilityId: "PrepTask.start",
  entity: "PrepTask",
  command: "start",
  route: "/api/manifest/PrepTask/commands/start",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["PrepTaskStarted"],
} as const;

/**
 * Build command input for PrepTask.start.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPrepTaskStartInput(client: PrepTaskStartClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PrepTask.start. */
export const PrepTaskStartInvalidation = [
  {
    "kind": "entityList",
    "entity": "PrepTask",
    "queryKeyHint": "queryKeys.prepTask.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PrepTask",
    "queryKeyHint": "queryKeys.prepTask.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for PrepTask.start. */
export const PrepTaskStartLifecycle = [
  {
    "property": "status",
    "from": "claimed",
    "to": "in_progress",
    "proven": true
  }
] as const;

// --- PrepTask.unblock ---
export type PrepTaskUnblockClientInput = Record<string, never>;

export const PrepTaskUnblockCapability = {
  capabilityId: "PrepTask.unblock",
  entity: "PrepTask",
  command: "unblock",
  route: "/api/manifest/PrepTask/commands/unblock",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["PrepTaskUnblocked"],
} as const;

/**
 * Build command input for PrepTask.unblock.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPrepTaskUnblockInput(client: PrepTaskUnblockClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PrepTask.unblock. */
export const PrepTaskUnblockInvalidation = [
  {
    "kind": "entityList",
    "entity": "PrepTask",
    "queryKeyHint": "queryKeys.prepTask.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PrepTask",
    "queryKeyHint": "queryKeys.prepTask.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for PrepTask.unblock. */
export const PrepTaskUnblockLifecycle = [
  {
    "property": "status",
    "from": "claimed",
    "to": "pending",
    "proven": true
  },
  {
    "property": "status",
    "from": "blocked",
    "to": "pending",
    "proven": true
  }
] as const;

// --- ProductionBatch.cancel ---
export interface ProductionBatchCancelClientInput {
  reason: string;
}

export const ProductionBatchCancelCapability = {
  capabilityId: "ProductionBatch.cancel",
  entity: "ProductionBatch",
  command: "cancel",
  route: "/api/manifest/ProductionBatch/commands/cancel",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["ProductionBatchCancelled"],
} as const;

/**
 * Build command input for ProductionBatch.cancel.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindProductionBatchCancelInput(client: ProductionBatchCancelClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful ProductionBatch.cancel. */
export const ProductionBatchCancelInvalidation = [
  {
    "kind": "entityList",
    "entity": "ProductionBatch",
    "queryKeyHint": "queryKeys.productionBatch.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "ProductionBatch",
    "queryKeyHint": "queryKeys.productionBatch.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for ProductionBatch.cancel. */
export const ProductionBatchCancelLifecycle = [
  {
    "property": "status",
    "from": "planned",
    "to": "cancelled",
    "proven": true
  },
  {
    "property": "status",
    "from": "in_progress",
    "to": "cancelled",
    "proven": true
  }
] as const;

// --- ProductionBatch.complete ---
export interface ProductionBatchCompleteClientInput {
  /** Bounds: 0..∞ */
  actualYield: number;
}

export const ProductionBatchCompleteCapability = {
  capabilityId: "ProductionBatch.complete",
  entity: "ProductionBatch",
  command: "complete",
  route: "/api/manifest/ProductionBatch/commands/complete",
  instanceCommand: true,
  clientParameterNames: ["actualYield"],
  serverParameterNames: [],
  emits: ["ProductionBatchCompleted"],
} as const;

/**
 * Build command input for ProductionBatch.complete.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindProductionBatchCompleteInput(client: ProductionBatchCompleteClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful ProductionBatch.complete. */
export const ProductionBatchCompleteInvalidation = [
  {
    "kind": "entityList",
    "entity": "ProductionBatch",
    "queryKeyHint": "queryKeys.productionBatch.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "ProductionBatch",
    "queryKeyHint": "queryKeys.productionBatch.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for ProductionBatch.complete. */
export const ProductionBatchCompleteLifecycle = [
  {
    "property": "status",
    "from": "in_progress",
    "to": "completed",
    "proven": true
  }
] as const;

// --- ProductionBatch.plan ---
export interface ProductionBatchPlanClientInput {
  recipeId: string;
  /** Bounds: 1..∞ */
  plannedYield: number;
  /** Allowed: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion" */
  yieldUnit: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion";
  eventId?: string;
  notes?: string;
}

export const ProductionBatchPlanCapability = {
  capabilityId: "ProductionBatch.plan",
  entity: "ProductionBatch",
  command: "plan",
  route: "/api/manifest/ProductionBatch/commands/plan",
  instanceCommand: true,
  clientParameterNames: ["recipeId","plannedYield","yieldUnit","eventId","notes"],
  serverParameterNames: [],
  emits: ["ProductionBatchPlanned"],
} as const;

/**
 * Build command input for ProductionBatch.plan.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindProductionBatchPlanInput(client: ProductionBatchPlanClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful ProductionBatch.plan. */
export const ProductionBatchPlanInvalidation = [
  {
    "kind": "entityList",
    "entity": "ProductionBatch",
    "queryKeyHint": "queryKeys.productionBatch.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "ProductionBatch",
    "queryKeyHint": "queryKeys.productionBatch.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- ProductionBatch.start ---
export type ProductionBatchStartClientInput = Record<string, never>;

export const ProductionBatchStartCapability = {
  capabilityId: "ProductionBatch.start",
  entity: "ProductionBatch",
  command: "start",
  route: "/api/manifest/ProductionBatch/commands/start",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["ProductionBatchStarted"],
} as const;

/**
 * Build command input for ProductionBatch.start.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindProductionBatchStartInput(client: ProductionBatchStartClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful ProductionBatch.start. */
export const ProductionBatchStartInvalidation = [
  {
    "kind": "entityList",
    "entity": "ProductionBatch",
    "queryKeyHint": "queryKeys.productionBatch.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "ProductionBatch",
    "queryKeyHint": "queryKeys.productionBatch.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for ProductionBatch.start. */
export const ProductionBatchStartLifecycle = [
  {
    "property": "status",
    "from": "planned",
    "to": "in_progress",
    "proven": true
  }
] as const;

// --- Proposal.accept ---
export interface ProposalAcceptClientInput {
  eventId?: string;
}

export const ProposalAcceptCapability = {
  capabilityId: "Proposal.accept",
  entity: "Proposal",
  command: "accept",
  route: "/api/manifest/Proposal/commands/accept",
  instanceCommand: true,
  clientParameterNames: ["eventId"],
  serverParameterNames: [],
  emits: ["ProposalAccepted"],
} as const;

/**
 * Build command input for Proposal.accept.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindProposalAcceptInput(client: ProposalAcceptClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Proposal.accept. */
export const ProposalAcceptInvalidation = [
  {
    "kind": "entityList",
    "entity": "Proposal",
    "queryKeyHint": "queryKeys.proposal.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Proposal",
    "queryKeyHint": "queryKeys.proposal.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Proposal.accept. */
export const ProposalAcceptLifecycle = [
  {
    "property": "status",
    "from": "sent",
    "to": "accepted",
    "proven": true
  },
  {
    "property": "status",
    "from": "viewed",
    "to": "accepted",
    "proven": true
  }
] as const;

// --- Proposal.decline ---
export type ProposalDeclineClientInput = Record<string, never>;

export const ProposalDeclineCapability = {
  capabilityId: "Proposal.decline",
  entity: "Proposal",
  command: "decline",
  route: "/api/manifest/Proposal/commands/decline",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["ProposalDeclined"],
} as const;

/**
 * Build command input for Proposal.decline.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindProposalDeclineInput(client: ProposalDeclineClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Proposal.decline. */
export const ProposalDeclineInvalidation = [
  {
    "kind": "entityList",
    "entity": "Proposal",
    "queryKeyHint": "queryKeys.proposal.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Proposal",
    "queryKeyHint": "queryKeys.proposal.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Proposal.decline. */
export const ProposalDeclineLifecycle = [
  {
    "property": "status",
    "from": "sent",
    "to": "declined",
    "proven": true
  },
  {
    "property": "status",
    "from": "viewed",
    "to": "declined",
    "proven": true
  }
] as const;

// --- Proposal.draft ---
export interface ProposalDraftClientInput {
  clientId: string;
  title: string;
  /** Bounds: 0..∞ */
  subtotal: number;
  /** Bounds: 0..∞ */
  taxAmount: number;
  /** Bounds: 0..∞ */
  discountAmount: number;
  /** Bounds: 0..∞ */
  total: number;
  proposalNumber?: string;
  eventDate?: string;
  eventType?: string;
  /** Bounds: 0..∞ */
  guestCount?: number;
  venueName?: string;
  venueAddress?: string;
  expiresAt?: string;
  notes?: string;
  terms?: string;
}

export const ProposalDraftCapability = {
  capabilityId: "Proposal.draft",
  entity: "Proposal",
  command: "draft",
  route: "/api/manifest/Proposal/commands/draft",
  instanceCommand: true,
  clientParameterNames: ["clientId","title","subtotal","taxAmount","discountAmount","total","proposalNumber","eventDate","eventType","guestCount","venueName","venueAddress","expiresAt","notes","terms"],
  serverParameterNames: [],
  emits: ["ProposalDrafted"],
} as const;

/**
 * Build command input for Proposal.draft.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindProposalDraftInput(client: ProposalDraftClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Proposal.draft. */
export const ProposalDraftInvalidation = [
  {
    "kind": "entityList",
    "entity": "Proposal",
    "queryKeyHint": "queryKeys.proposal.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Proposal",
    "queryKeyHint": "queryKeys.proposal.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Proposal.expire ---
export type ProposalExpireClientInput = Record<string, never>;

export const ProposalExpireCapability = {
  capabilityId: "Proposal.expire",
  entity: "Proposal",
  command: "expire",
  route: "/api/manifest/Proposal/commands/expire",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["ProposalExpired"],
} as const;

/**
 * Build command input for Proposal.expire.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindProposalExpireInput(client: ProposalExpireClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Proposal.expire. */
export const ProposalExpireInvalidation = [
  {
    "kind": "entityList",
    "entity": "Proposal",
    "queryKeyHint": "queryKeys.proposal.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Proposal",
    "queryKeyHint": "queryKeys.proposal.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Proposal.expire. */
export const ProposalExpireLifecycle = [
  {
    "property": "status",
    "from": "sent",
    "to": "expired",
    "proven": true
  },
  {
    "property": "status",
    "from": "viewed",
    "to": "expired",
    "proven": true
  }
] as const;

// --- Proposal.markViewed ---
export type ProposalMarkViewedClientInput = Record<string, never>;

export const ProposalMarkViewedCapability = {
  capabilityId: "Proposal.markViewed",
  entity: "Proposal",
  command: "markViewed",
  route: "/api/manifest/Proposal/commands/markViewed",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["ProposalViewed"],
} as const;

/**
 * Build command input for Proposal.markViewed.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindProposalMarkViewedInput(client: ProposalMarkViewedClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Proposal.markViewed. */
export const ProposalMarkViewedInvalidation = [
  {
    "kind": "entityList",
    "entity": "Proposal",
    "queryKeyHint": "queryKeys.proposal.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Proposal",
    "queryKeyHint": "queryKeys.proposal.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Proposal.markViewed. */
export const ProposalMarkViewedLifecycle = [
  {
    "property": "status",
    "from": "sent",
    "to": "viewed",
    "proven": true
  }
] as const;

// --- Proposal.send ---
export type ProposalSendClientInput = Record<string, never>;

export const ProposalSendCapability = {
  capabilityId: "Proposal.send",
  entity: "Proposal",
  command: "send",
  route: "/api/manifest/Proposal/commands/send",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["ProposalSent"],
} as const;

/**
 * Build command input for Proposal.send.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindProposalSendInput(client: ProposalSendClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Proposal.send. */
export const ProposalSendInvalidation = [
  {
    "kind": "entityList",
    "entity": "Proposal",
    "queryKeyHint": "queryKeys.proposal.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Proposal",
    "queryKeyHint": "queryKeys.proposal.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Proposal.send. */
export const ProposalSendLifecycle = [
  {
    "property": "status",
    "from": "draft",
    "to": "sent",
    "proven": true
  }
] as const;

// --- PurchaseNeed.assignToDraft ---
export interface PurchaseNeedAssignToDraftClientInput {
  vendorOrderId: string;
  vendorOrderLineId: string;
}

export const PurchaseNeedAssignToDraftCapability = {
  capabilityId: "PurchaseNeed.assignToDraft",
  entity: "PurchaseNeed",
  command: "assignToDraft",
  route: "/api/manifest/PurchaseNeed/commands/assignToDraft",
  instanceCommand: true,
  clientParameterNames: ["vendorOrderId","vendorOrderLineId"],
  serverParameterNames: [],
  emits: ["PurchaseNeedDraftAssigned"],
} as const;

/**
 * Build command input for PurchaseNeed.assignToDraft.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPurchaseNeedAssignToDraftInput(client: PurchaseNeedAssignToDraftClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PurchaseNeed.assignToDraft. */
export const PurchaseNeedAssignToDraftInvalidation = [
  {
    "kind": "entityList",
    "entity": "PurchaseNeed",
    "queryKeyHint": "queryKeys.purchaseNeed.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PurchaseNeed",
    "queryKeyHint": "queryKeys.purchaseNeed.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- PurchaseNeed.cancel ---
export interface PurchaseNeedCancelClientInput {
  reason: string;
}

export const PurchaseNeedCancelCapability = {
  capabilityId: "PurchaseNeed.cancel",
  entity: "PurchaseNeed",
  command: "cancel",
  route: "/api/manifest/PurchaseNeed/commands/cancel",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["PurchaseNeedCancelled"],
} as const;

/**
 * Build command input for PurchaseNeed.cancel.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPurchaseNeedCancelInput(client: PurchaseNeedCancelClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PurchaseNeed.cancel. */
export const PurchaseNeedCancelInvalidation = [
  {
    "kind": "entityList",
    "entity": "PurchaseNeed",
    "queryKeyHint": "queryKeys.purchaseNeed.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PurchaseNeed",
    "queryKeyHint": "queryKeys.purchaseNeed.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for PurchaseNeed.cancel. */
export const PurchaseNeedCancelLifecycle = [
  {
    "property": "status",
    "from": "open",
    "to": "cancelled",
    "proven": true
  },
  {
    "property": "status",
    "from": "ordered",
    "to": "cancelled",
    "proven": true
  }
] as const;

// --- PurchaseNeed.create ---
export interface PurchaseNeedCreateClientInput {
  eventId: string;
  ingredientDemandId: string;
  ingredientId: string;
  /** Bounds: 1..∞ */
  requiredQuantity: number;
  /** Allowed: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion" */
  unit: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion";
}

export const PurchaseNeedCreateCapability = {
  capabilityId: "PurchaseNeed.create",
  entity: "PurchaseNeed",
  command: "create",
  route: "/api/manifest/PurchaseNeed/commands/create",
  instanceCommand: false,
  clientParameterNames: ["eventId","ingredientDemandId","ingredientId","requiredQuantity","unit"],
  serverParameterNames: [],
  emits: ["PurchaseNeedOpened"],
} as const;

/**
 * Build command input for PurchaseNeed.create.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPurchaseNeedCreateInput(client: PurchaseNeedCreateClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PurchaseNeed.create. */
export const PurchaseNeedCreateInvalidation = [
  {
    "kind": "entityList",
    "entity": "PurchaseNeed",
    "queryKeyHint": "queryKeys.purchaseNeed.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PurchaseNeed",
    "queryKeyHint": "queryKeys.purchaseNeed.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- PurchaseNeed.markDraftOrdered ---
export type PurchaseNeedMarkDraftOrderedClientInput = Record<string, never>;

export const PurchaseNeedMarkDraftOrderedCapability = {
  capabilityId: "PurchaseNeed.markDraftOrdered",
  entity: "PurchaseNeed",
  command: "markDraftOrdered",
  route: "/api/manifest/PurchaseNeed/commands/markDraftOrdered",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["PurchaseNeedOrdered"],
} as const;

/**
 * Build command input for PurchaseNeed.markDraftOrdered.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPurchaseNeedMarkDraftOrderedInput(client: PurchaseNeedMarkDraftOrderedClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PurchaseNeed.markDraftOrdered. */
export const PurchaseNeedMarkDraftOrderedInvalidation = [
  {
    "kind": "entityList",
    "entity": "PurchaseNeed",
    "queryKeyHint": "queryKeys.purchaseNeed.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PurchaseNeed",
    "queryKeyHint": "queryKeys.purchaseNeed.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for PurchaseNeed.markDraftOrdered. */
export const PurchaseNeedMarkDraftOrderedLifecycle = [
  {
    "property": "status",
    "from": "open",
    "to": "ordered",
    "proven": true
  }
] as const;

// --- PurchaseNeed.markFulfilled ---
export type PurchaseNeedMarkFulfilledClientInput = Record<string, never>;

export const PurchaseNeedMarkFulfilledCapability = {
  capabilityId: "PurchaseNeed.markFulfilled",
  entity: "PurchaseNeed",
  command: "markFulfilled",
  route: "/api/manifest/PurchaseNeed/commands/markFulfilled",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["PurchaseNeedFulfilled"],
} as const;

/**
 * Build command input for PurchaseNeed.markFulfilled.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPurchaseNeedMarkFulfilledInput(client: PurchaseNeedMarkFulfilledClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PurchaseNeed.markFulfilled. */
export const PurchaseNeedMarkFulfilledInvalidation = [
  {
    "kind": "entityList",
    "entity": "PurchaseNeed",
    "queryKeyHint": "queryKeys.purchaseNeed.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PurchaseNeed",
    "queryKeyHint": "queryKeys.purchaseNeed.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for PurchaseNeed.markFulfilled. */
export const PurchaseNeedMarkFulfilledLifecycle = [
  {
    "property": "status",
    "from": "ordered",
    "to": "fulfilled",
    "proven": true
  }
] as const;

// --- PurchaseNeed.markOrdered ---
export interface PurchaseNeedMarkOrderedClientInput {
  vendorOrderId: string;
  vendorOrderLineId: string;
}

export const PurchaseNeedMarkOrderedCapability = {
  capabilityId: "PurchaseNeed.markOrdered",
  entity: "PurchaseNeed",
  command: "markOrdered",
  route: "/api/manifest/PurchaseNeed/commands/markOrdered",
  instanceCommand: true,
  clientParameterNames: ["vendorOrderId","vendorOrderLineId"],
  serverParameterNames: [],
  emits: ["PurchaseNeedOrdered"],
} as const;

/**
 * Build command input for PurchaseNeed.markOrdered.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindPurchaseNeedMarkOrderedInput(client: PurchaseNeedMarkOrderedClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful PurchaseNeed.markOrdered. */
export const PurchaseNeedMarkOrderedInvalidation = [
  {
    "kind": "entityList",
    "entity": "PurchaseNeed",
    "queryKeyHint": "queryKeys.purchaseNeed.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "PurchaseNeed",
    "queryKeyHint": "queryKeys.purchaseNeed.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for PurchaseNeed.markOrdered. */
export const PurchaseNeedMarkOrderedLifecycle = [
  {
    "property": "status",
    "from": "open",
    "to": "ordered",
    "proven": true
  }
] as const;

// --- Qualification.expire ---
export type QualificationExpireClientInput = Record<string, never>;

export const QualificationExpireCapability = {
  capabilityId: "Qualification.expire",
  entity: "Qualification",
  command: "expire",
  route: "/api/manifest/Qualification/commands/expire",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["QualificationExpired"],
} as const;

/**
 * Build command input for Qualification.expire.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindQualificationExpireInput(client: QualificationExpireClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Qualification.expire. */
export const QualificationExpireInvalidation = [
  {
    "kind": "entityList",
    "entity": "Qualification",
    "queryKeyHint": "queryKeys.qualification.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Qualification",
    "queryKeyHint": "queryKeys.qualification.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Qualification.expire. */
export const QualificationExpireLifecycle = [
  {
    "property": "status",
    "from": "active",
    "to": "expired",
    "proven": true
  }
] as const;

// --- Qualification.grant ---
export interface QualificationGrantClientInput {
  personId: string;
  name: string;
  /** Must not be "". */
  issuedAt: string & { readonly __nonEmpty?: true };
  certificationType?: string;
  expiresAt?: string;
  documentRef?: string;
  notes?: string;
}

export const QualificationGrantCapability = {
  capabilityId: "Qualification.grant",
  entity: "Qualification",
  command: "grant",
  route: "/api/manifest/Qualification/commands/grant",
  instanceCommand: true,
  clientParameterNames: ["personId","name","issuedAt","certificationType","expiresAt","documentRef","notes"],
  serverParameterNames: [],
  emits: ["QualificationGranted"],
} as const;

/**
 * Build command input for Qualification.grant.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindQualificationGrantInput(client: QualificationGrantClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Qualification.grant. */
export const QualificationGrantInvalidation = [
  {
    "kind": "entityList",
    "entity": "Qualification",
    "queryKeyHint": "queryKeys.qualification.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Qualification",
    "queryKeyHint": "queryKeys.qualification.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Qualification.revoke ---
export interface QualificationRevokeClientInput {
  notes?: string;
}

export const QualificationRevokeCapability = {
  capabilityId: "Qualification.revoke",
  entity: "Qualification",
  command: "revoke",
  route: "/api/manifest/Qualification/commands/revoke",
  instanceCommand: true,
  clientParameterNames: ["notes"],
  serverParameterNames: [],
  emits: ["QualificationRevoked"],
} as const;

/**
 * Build command input for Qualification.revoke.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindQualificationRevokeInput(client: QualificationRevokeClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Qualification.revoke. */
export const QualificationRevokeInvalidation = [
  {
    "kind": "entityList",
    "entity": "Qualification",
    "queryKeyHint": "queryKeys.qualification.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Qualification",
    "queryKeyHint": "queryKeys.qualification.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Qualification.revoke. */
export const QualificationRevokeLifecycle = [
  {
    "property": "status",
    "from": "active",
    "to": "revoked",
    "proven": true
  }
] as const;

// --- QualityCheck.fail ---
export interface QualityCheckFailClientInput {
  notes?: string;
}

export const QualityCheckFailCapability = {
  capabilityId: "QualityCheck.fail",
  entity: "QualityCheck",
  command: "fail",
  route: "/api/manifest/QualityCheck/commands/fail",
  instanceCommand: true,
  clientParameterNames: ["notes"],
  serverParameterNames: [],
  emits: ["QualityCheckFailed"],
} as const;

/**
 * Build command input for QualityCheck.fail.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindQualityCheckFailInput(client: QualityCheckFailClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful QualityCheck.fail. */
export const QualityCheckFailInvalidation = [
  {
    "kind": "entityList",
    "entity": "QualityCheck",
    "queryKeyHint": "queryKeys.qualityCheck.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "QualityCheck",
    "queryKeyHint": "queryKeys.qualityCheck.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for QualityCheck.fail. */
export const QualityCheckFailLifecycle = [
  {
    "property": "status",
    "from": "pending",
    "to": "failed",
    "proven": true
  }
] as const;

// --- QualityCheck.open ---
export interface QualityCheckOpenClientInput {
  prepTaskId?: string;
  productionBatchId?: string;
  notes?: string;
}

export const QualityCheckOpenCapability = {
  capabilityId: "QualityCheck.open",
  entity: "QualityCheck",
  command: "open",
  route: "/api/manifest/QualityCheck/commands/open",
  instanceCommand: true,
  clientParameterNames: ["prepTaskId","productionBatchId","notes"],
  serverParameterNames: [],
  emits: ["QualityCheckOpened"],
} as const;

/**
 * Build command input for QualityCheck.open.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindQualityCheckOpenInput(client: QualityCheckOpenClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful QualityCheck.open. */
export const QualityCheckOpenInvalidation = [
  {
    "kind": "entityList",
    "entity": "QualityCheck",
    "queryKeyHint": "queryKeys.qualityCheck.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "QualityCheck",
    "queryKeyHint": "queryKeys.qualityCheck.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- QualityCheck.pass ---
export interface QualityCheckPassClientInput {
  notes?: string;
}

export const QualityCheckPassCapability = {
  capabilityId: "QualityCheck.pass",
  entity: "QualityCheck",
  command: "pass",
  route: "/api/manifest/QualityCheck/commands/pass",
  instanceCommand: true,
  clientParameterNames: ["notes"],
  serverParameterNames: [],
  emits: ["QualityCheckPassed"],
} as const;

/**
 * Build command input for QualityCheck.pass.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindQualityCheckPassInput(client: QualityCheckPassClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful QualityCheck.pass. */
export const QualityCheckPassInvalidation = [
  {
    "kind": "entityList",
    "entity": "QualityCheck",
    "queryKeyHint": "queryKeys.qualityCheck.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "QualityCheck",
    "queryKeyHint": "queryKeys.qualityCheck.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for QualityCheck.pass. */
export const QualityCheckPassLifecycle = [
  {
    "property": "status",
    "from": "pending",
    "to": "passed",
    "proven": true
  }
] as const;

// --- QualityCheck.reinspect ---
export type QualityCheckReinspectClientInput = Record<string, never>;

export const QualityCheckReinspectCapability = {
  capabilityId: "QualityCheck.reinspect",
  entity: "QualityCheck",
  command: "reinspect",
  route: "/api/manifest/QualityCheck/commands/reinspect",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["QualityCheckReopened"],
} as const;

/**
 * Build command input for QualityCheck.reinspect.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindQualityCheckReinspectInput(client: QualityCheckReinspectClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful QualityCheck.reinspect. */
export const QualityCheckReinspectInvalidation = [
  {
    "kind": "entityList",
    "entity": "QualityCheck",
    "queryKeyHint": "queryKeys.qualityCheck.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "QualityCheck",
    "queryKeyHint": "queryKeys.qualityCheck.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for QualityCheck.reinspect. */
export const QualityCheckReinspectLifecycle = [
  {
    "property": "status",
    "from": "passed",
    "to": "pending",
    "proven": true
  },
  {
    "property": "status",
    "from": "failed",
    "to": "pending",
    "proven": true
  }
] as const;

// --- Recipe.draft ---
export interface RecipeDraftClientInput {
  name: string;
  /** Bounds: 1..∞ */
  yieldQuantity: number;
  /** Allowed: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion" */
  yieldUnit: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion";
  /** Bounds: 1..∞ */
  batchMultiplier?: number;
  category?: string;
  cuisine?: string;
  description?: string;
  instructions?: string;
}

export const RecipeDraftCapability = {
  capabilityId: "Recipe.draft",
  entity: "Recipe",
  command: "draft",
  route: "/api/manifest/Recipe/commands/draft",
  instanceCommand: true,
  clientParameterNames: ["name","yieldQuantity","yieldUnit","batchMultiplier","category","cuisine","description","instructions"],
  serverParameterNames: [],
  emits: ["RecipeDrafted"],
} as const;

/**
 * Build command input for Recipe.draft.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeDraftInput(client: RecipeDraftClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Recipe.draft. */
export const RecipeDraftInvalidation = [
  {
    "kind": "entityList",
    "entity": "Recipe",
    "queryKeyHint": "queryKeys.recipe.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Recipe",
    "queryKeyHint": "queryKeys.recipe.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Recipe.publishVersion ---
export type RecipePublishVersionClientInput = Record<string, never>;

export const RecipePublishVersionCapability = {
  capabilityId: "Recipe.publishVersion",
  entity: "Recipe",
  command: "publishVersion",
  route: "/api/manifest/Recipe/commands/publishVersion",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["RecipeVersionPublished"],
} as const;

/**
 * Build command input for Recipe.publishVersion.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipePublishVersionInput(client: RecipePublishVersionClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Recipe.publishVersion. */
export const RecipePublishVersionInvalidation = [
  {
    "kind": "entityList",
    "entity": "Recipe",
    "queryKeyHint": "queryKeys.recipe.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Recipe",
    "queryKeyHint": "queryKeys.recipe.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Recipe.publishVersion. */
export const RecipePublishVersionLifecycle = [
  {
    "property": "status",
    "from": "draft",
    "to": "published",
    "proven": true
  }
] as const;

// --- Recipe.retire ---
export interface RecipeRetireClientInput {
  reason: string;
}

export const RecipeRetireCapability = {
  capabilityId: "Recipe.retire",
  entity: "Recipe",
  command: "retire",
  route: "/api/manifest/Recipe/commands/retire",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["RecipeRetired"],
} as const;

/**
 * Build command input for Recipe.retire.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeRetireInput(client: RecipeRetireClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Recipe.retire. */
export const RecipeRetireInvalidation = [
  {
    "kind": "entityList",
    "entity": "Recipe",
    "queryKeyHint": "queryKeys.recipe.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Recipe",
    "queryKeyHint": "queryKeys.recipe.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Recipe.retire. */
export const RecipeRetireLifecycle = [
  {
    "property": "status",
    "from": "draft",
    "to": "retired",
    "proven": true
  },
  {
    "property": "status",
    "from": "published",
    "to": "retired",
    "proven": true
  }
] as const;

// --- Recipe.retract ---
export type RecipeRetractClientInput = Record<string, never>;

export const RecipeRetractCapability = {
  capabilityId: "Recipe.retract",
  entity: "Recipe",
  command: "retract",
  route: "/api/manifest/Recipe/commands/retract",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["RecipeVersionRetracted"],
} as const;

/**
 * Build command input for Recipe.retract.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeRetractInput(client: RecipeRetractClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Recipe.retract. */
export const RecipeRetractInvalidation = [
  {
    "kind": "entityList",
    "entity": "Recipe",
    "queryKeyHint": "queryKeys.recipe.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Recipe",
    "queryKeyHint": "queryKeys.recipe.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Recipe.retract. */
export const RecipeRetractLifecycle = [
  {
    "property": "status",
    "from": "published",
    "to": "draft",
    "proven": true
  }
] as const;

// --- Recipe.reviseDraft ---
export interface RecipeReviseDraftClientInput {
  name: string;
  /** Bounds: 1..∞ */
  yieldQuantity: number;
  /** Allowed: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion" */
  yieldUnit: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion";
  /** Bounds: 1..∞ */
  batchMultiplier: number;
  category?: string;
  cuisine?: string;
  description?: string;
  instructions?: string;
}

export const RecipeReviseDraftCapability = {
  capabilityId: "Recipe.reviseDraft",
  entity: "Recipe",
  command: "reviseDraft",
  route: "/api/manifest/Recipe/commands/reviseDraft",
  instanceCommand: true,
  clientParameterNames: ["name","yieldQuantity","yieldUnit","batchMultiplier","category","cuisine","description","instructions"],
  serverParameterNames: [],
  emits: ["RecipeDraftRevised"],
} as const;

/**
 * Build command input for Recipe.reviseDraft.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeReviseDraftInput(client: RecipeReviseDraftClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Recipe.reviseDraft. */
export const RecipeReviseDraftInvalidation = [
  {
    "kind": "entityList",
    "entity": "Recipe",
    "queryKeyHint": "queryKeys.recipe.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Recipe",
    "queryKeyHint": "queryKeys.recipe.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- RecipeImport.approveReview ---
export type RecipeImportApproveReviewClientInput = Record<string, never>;

export const RecipeImportApproveReviewCapability = {
  capabilityId: "RecipeImport.approveReview",
  entity: "RecipeImport",
  command: "approveReview",
  route: "/api/manifest/RecipeImport/commands/approveReview",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["RecipeImportReviewApproved"],
} as const;

/**
 * Build command input for RecipeImport.approveReview.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeImportApproveReviewInput(client: RecipeImportApproveReviewClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful RecipeImport.approveReview. */
export const RecipeImportApproveReviewInvalidation = [
  {
    "kind": "entityList",
    "entity": "RecipeImport",
    "queryKeyHint": "queryKeys.recipeImport.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "RecipeImport",
    "queryKeyHint": "queryKeys.recipeImport.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for RecipeImport.approveReview. */
export const RecipeImportApproveReviewLifecycle = [
  {
    "property": "status",
    "from": "reviewing",
    "to": "ready",
    "proven": true
  }
] as const;

// --- RecipeImport.beginFinalization ---
export type RecipeImportBeginFinalizationClientInput = Record<string, never>;

export const RecipeImportBeginFinalizationCapability = {
  capabilityId: "RecipeImport.beginFinalization",
  entity: "RecipeImport",
  command: "beginFinalization",
  route: "/api/manifest/RecipeImport/commands/beginFinalization",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["RecipeImportFinalizationStarted"],
} as const;

/**
 * Build command input for RecipeImport.beginFinalization.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeImportBeginFinalizationInput(client: RecipeImportBeginFinalizationClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful RecipeImport.beginFinalization. */
export const RecipeImportBeginFinalizationInvalidation = [
  {
    "kind": "entityList",
    "entity": "RecipeImport",
    "queryKeyHint": "queryKeys.recipeImport.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "RecipeImport",
    "queryKeyHint": "queryKeys.recipeImport.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for RecipeImport.beginFinalization. */
export const RecipeImportBeginFinalizationLifecycle = [
  {
    "property": "status",
    "from": "ready",
    "to": "finalizing",
    "proven": true
  }
] as const;

// --- RecipeImport.beginReview ---
export type RecipeImportBeginReviewClientInput = Record<string, never>;

export const RecipeImportBeginReviewCapability = {
  capabilityId: "RecipeImport.beginReview",
  entity: "RecipeImport",
  command: "beginReview",
  route: "/api/manifest/RecipeImport/commands/beginReview",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["RecipeImportReviewStarted"],
} as const;

/**
 * Build command input for RecipeImport.beginReview.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeImportBeginReviewInput(client: RecipeImportBeginReviewClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful RecipeImport.beginReview. */
export const RecipeImportBeginReviewInvalidation = [
  {
    "kind": "entityList",
    "entity": "RecipeImport",
    "queryKeyHint": "queryKeys.recipeImport.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "RecipeImport",
    "queryKeyHint": "queryKeys.recipeImport.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for RecipeImport.beginReview. */
export const RecipeImportBeginReviewLifecycle = [
  {
    "property": "status",
    "from": "parsed",
    "to": "reviewing",
    "proven": true
  },
  {
    "property": "status",
    "from": "ready",
    "to": "reviewing",
    "proven": true
  },
  {
    "property": "status",
    "from": "finalizing",
    "to": "reviewing",
    "proven": true
  },
  {
    "property": "status",
    "from": "failed",
    "to": "reviewing",
    "proven": true
  }
] as const;

// --- RecipeImport.cancel ---
export interface RecipeImportCancelClientInput {
  reason: string;
}

export const RecipeImportCancelCapability = {
  capabilityId: "RecipeImport.cancel",
  entity: "RecipeImport",
  command: "cancel",
  route: "/api/manifest/RecipeImport/commands/cancel",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["RecipeImportCancelled"],
} as const;

/**
 * Build command input for RecipeImport.cancel.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeImportCancelInput(client: RecipeImportCancelClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful RecipeImport.cancel. */
export const RecipeImportCancelInvalidation = [
  {
    "kind": "entityList",
    "entity": "RecipeImport",
    "queryKeyHint": "queryKeys.recipeImport.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "RecipeImport",
    "queryKeyHint": "queryKeys.recipeImport.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for RecipeImport.cancel. */
export const RecipeImportCancelLifecycle = [
  {
    "property": "status",
    "from": "uploaded",
    "to": "cancelled",
    "proven": true
  },
  {
    "property": "status",
    "from": "parsed",
    "to": "cancelled",
    "proven": true
  },
  {
    "property": "status",
    "from": "reviewing",
    "to": "cancelled",
    "proven": true
  },
  {
    "property": "status",
    "from": "ready",
    "to": "cancelled",
    "proven": true
  },
  {
    "property": "status",
    "from": "finalizing",
    "to": "cancelled",
    "proven": true
  },
  {
    "property": "status",
    "from": "failed",
    "to": "cancelled",
    "proven": true
  }
] as const;

// --- RecipeImport.complete ---
export type RecipeImportCompleteClientInput = Record<string, never>;

export const RecipeImportCompleteCapability = {
  capabilityId: "RecipeImport.complete",
  entity: "RecipeImport",
  command: "complete",
  route: "/api/manifest/RecipeImport/commands/complete",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["RecipeImportCompleted"],
} as const;

/**
 * Build command input for RecipeImport.complete.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeImportCompleteInput(client: RecipeImportCompleteClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful RecipeImport.complete. */
export const RecipeImportCompleteInvalidation = [
  {
    "kind": "entityList",
    "entity": "RecipeImport",
    "queryKeyHint": "queryKeys.recipeImport.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "RecipeImport",
    "queryKeyHint": "queryKeys.recipeImport.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for RecipeImport.complete. */
export const RecipeImportCompleteLifecycle = [
  {
    "property": "status",
    "from": "finalizing",
    "to": "completed",
    "proven": true
  }
] as const;

// --- RecipeImport.markFailed ---
export interface RecipeImportMarkFailedClientInput {
  failureDetail: string;
  duringParsing?: boolean;
}

export const RecipeImportMarkFailedCapability = {
  capabilityId: "RecipeImport.markFailed",
  entity: "RecipeImport",
  command: "markFailed",
  route: "/api/manifest/RecipeImport/commands/markFailed",
  instanceCommand: true,
  clientParameterNames: ["failureDetail","duringParsing"],
  serverParameterNames: [],
  emits: ["RecipeImportFailed"],
} as const;

/**
 * Build command input for RecipeImport.markFailed.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeImportMarkFailedInput(client: RecipeImportMarkFailedClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful RecipeImport.markFailed. */
export const RecipeImportMarkFailedInvalidation = [
  {
    "kind": "entityList",
    "entity": "RecipeImport",
    "queryKeyHint": "queryKeys.recipeImport.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "RecipeImport",
    "queryKeyHint": "queryKeys.recipeImport.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for RecipeImport.markFailed. */
export const RecipeImportMarkFailedLifecycle = [
  {
    "property": "status",
    "from": "uploaded",
    "to": "failed",
    "proven": true
  },
  {
    "property": "status",
    "from": "parsed",
    "to": "failed",
    "proven": true
  },
  {
    "property": "status",
    "from": "reviewing",
    "to": "failed",
    "proven": true
  },
  {
    "property": "status",
    "from": "ready",
    "to": "failed",
    "proven": true
  },
  {
    "property": "status",
    "from": "finalizing",
    "to": "failed",
    "proven": true
  }
] as const;

// --- RecipeImport.recordParse ---
export interface RecipeImportRecordParseClientInput {
  parsedName: string;
  /** Bounds: 0..∞ */
  parsedLineCount: number;
  parsedDescription?: string;
  parsedCategory?: string;
  parsedCuisine?: string;
  parsedInstructions?: string;
  /** Bounds: 1..∞ */
  parsedYieldQuantity?: number;
  /** Allowed: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion" */
  parsedYieldUnit?: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion";
  /** Bounds: 1..∞ */
  parsedBatchMultiplier?: number;
}

export const RecipeImportRecordParseCapability = {
  capabilityId: "RecipeImport.recordParse",
  entity: "RecipeImport",
  command: "recordParse",
  route: "/api/manifest/RecipeImport/commands/recordParse",
  instanceCommand: true,
  clientParameterNames: ["parsedName","parsedLineCount","parsedDescription","parsedCategory","parsedCuisine","parsedInstructions","parsedYieldQuantity","parsedYieldUnit","parsedBatchMultiplier"],
  serverParameterNames: [],
  emits: ["RecipeImportParsed"],
} as const;

/**
 * Build command input for RecipeImport.recordParse.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeImportRecordParseInput(client: RecipeImportRecordParseClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful RecipeImport.recordParse. */
export const RecipeImportRecordParseInvalidation = [
  {
    "kind": "entityList",
    "entity": "RecipeImport",
    "queryKeyHint": "queryKeys.recipeImport.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "RecipeImport",
    "queryKeyHint": "queryKeys.recipeImport.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for RecipeImport.recordParse. */
export const RecipeImportRecordParseLifecycle = [
  {
    "property": "status",
    "from": "uploaded",
    "to": "parsed",
    "proven": true
  }
] as const;

// --- RecipeImport.recordRecipe ---
export interface RecipeImportRecordRecipeClientInput {
  resultingRecipeId: string;
}

export const RecipeImportRecordRecipeCapability = {
  capabilityId: "RecipeImport.recordRecipe",
  entity: "RecipeImport",
  command: "recordRecipe",
  route: "/api/manifest/RecipeImport/commands/recordRecipe",
  instanceCommand: true,
  clientParameterNames: ["resultingRecipeId"],
  serverParameterNames: [],
  emits: ["RecipeImportRecipeRecorded"],
} as const;

/**
 * Build command input for RecipeImport.recordRecipe.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeImportRecordRecipeInput(client: RecipeImportRecordRecipeClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful RecipeImport.recordRecipe. */
export const RecipeImportRecordRecipeInvalidation = [
  {
    "kind": "entityList",
    "entity": "RecipeImport",
    "queryKeyHint": "queryKeys.recipeImport.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "RecipeImport",
    "queryKeyHint": "queryKeys.recipeImport.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- RecipeImport.recordResolutionProgress ---
export interface RecipeImportRecordResolutionProgressClientInput {
  /** Bounds: 0..∞ */
  resolvedLineCount: number;
}

export const RecipeImportRecordResolutionProgressCapability = {
  capabilityId: "RecipeImport.recordResolutionProgress",
  entity: "RecipeImport",
  command: "recordResolutionProgress",
  route: "/api/manifest/RecipeImport/commands/recordResolutionProgress",
  instanceCommand: true,
  clientParameterNames: ["resolvedLineCount"],
  serverParameterNames: [],
  emits: ["RecipeImportResolutionProgressRecorded"],
} as const;

/**
 * Build command input for RecipeImport.recordResolutionProgress.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeImportRecordResolutionProgressInput(client: RecipeImportRecordResolutionProgressClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful RecipeImport.recordResolutionProgress. */
export const RecipeImportRecordResolutionProgressInvalidation = [
  {
    "kind": "entityList",
    "entity": "RecipeImport",
    "queryKeyHint": "queryKeys.recipeImport.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "RecipeImport",
    "queryKeyHint": "queryKeys.recipeImport.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- RecipeImport.resumeReview ---
export type RecipeImportResumeReviewClientInput = Record<string, never>;

export const RecipeImportResumeReviewCapability = {
  capabilityId: "RecipeImport.resumeReview",
  entity: "RecipeImport",
  command: "resumeReview",
  route: "/api/manifest/RecipeImport/commands/resumeReview",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["RecipeImportReviewResumed"],
} as const;

/**
 * Build command input for RecipeImport.resumeReview.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeImportResumeReviewInput(client: RecipeImportResumeReviewClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful RecipeImport.resumeReview. */
export const RecipeImportResumeReviewInvalidation = [
  {
    "kind": "entityList",
    "entity": "RecipeImport",
    "queryKeyHint": "queryKeys.recipeImport.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "RecipeImport",
    "queryKeyHint": "queryKeys.recipeImport.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for RecipeImport.resumeReview. */
export const RecipeImportResumeReviewLifecycle = [
  {
    "property": "status",
    "from": "parsed",
    "to": "reviewing",
    "proven": true
  },
  {
    "property": "status",
    "from": "ready",
    "to": "reviewing",
    "proven": true
  },
  {
    "property": "status",
    "from": "finalizing",
    "to": "reviewing",
    "proven": true
  },
  {
    "property": "status",
    "from": "failed",
    "to": "reviewing",
    "proven": true
  }
] as const;

// --- RecipeImport.upload ---
export interface RecipeImportUploadClientInput {
  /** Allowed: "pasted_text" | "text_file" | "csv_bundle" */
  sourceKind: "pasted_text" | "text_file" | "csv_bundle";
  rawSourceText: string;
  /** Bounds: 0..∞ */
  sourceByteCount: number;
  sourceFingerprint: string;
  sourceFilename?: string;
}

export const RecipeImportUploadCapability = {
  capabilityId: "RecipeImport.upload",
  entity: "RecipeImport",
  command: "upload",
  route: "/api/manifest/RecipeImport/commands/upload",
  instanceCommand: true,
  clientParameterNames: ["sourceKind","rawSourceText","sourceByteCount","sourceFingerprint","sourceFilename"],
  serverParameterNames: [],
  emits: ["RecipeImportUploaded"],
} as const;

/**
 * Build command input for RecipeImport.upload.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeImportUploadInput(client: RecipeImportUploadClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful RecipeImport.upload. */
export const RecipeImportUploadInvalidation = [
  {
    "kind": "entityList",
    "entity": "RecipeImport",
    "queryKeyHint": "queryKeys.recipeImport.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "RecipeImport",
    "queryKeyHint": "queryKeys.recipeImport.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- RecipeImportLine.attachCreatedIngredient ---
export interface RecipeImportLineAttachCreatedIngredientClientInput {
  matchedIngredientId: string;
}

export const RecipeImportLineAttachCreatedIngredientCapability = {
  capabilityId: "RecipeImportLine.attachCreatedIngredient",
  entity: "RecipeImportLine",
  command: "attachCreatedIngredient",
  route: "/api/manifest/RecipeImportLine/commands/attachCreatedIngredient",
  instanceCommand: true,
  clientParameterNames: ["matchedIngredientId"],
  serverParameterNames: [],
  emits: ["RecipeImportLineCreatedIngredientAttached"],
} as const;

/**
 * Build command input for RecipeImportLine.attachCreatedIngredient.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeImportLineAttachCreatedIngredientInput(client: RecipeImportLineAttachCreatedIngredientClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful RecipeImportLine.attachCreatedIngredient. */
export const RecipeImportLineAttachCreatedIngredientInvalidation = [
  {
    "kind": "entityList",
    "entity": "RecipeImportLine",
    "queryKeyHint": "queryKeys.recipeImportLine.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "RecipeImportLine",
    "queryKeyHint": "queryKeys.recipeImportLine.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- RecipeImportLine.confirmExisting ---
export interface RecipeImportLineConfirmExistingClientInput {
  matchedIngredientId: string;
}

export const RecipeImportLineConfirmExistingCapability = {
  capabilityId: "RecipeImportLine.confirmExisting",
  entity: "RecipeImportLine",
  command: "confirmExisting",
  route: "/api/manifest/RecipeImportLine/commands/confirmExisting",
  instanceCommand: true,
  clientParameterNames: ["matchedIngredientId"],
  serverParameterNames: [],
  emits: ["RecipeImportLineExistingConfirmed"],
} as const;

/**
 * Build command input for RecipeImportLine.confirmExisting.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeImportLineConfirmExistingInput(client: RecipeImportLineConfirmExistingClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful RecipeImportLine.confirmExisting. */
export const RecipeImportLineConfirmExistingInvalidation = [
  {
    "kind": "entityList",
    "entity": "RecipeImportLine",
    "queryKeyHint": "queryKeys.recipeImportLine.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "RecipeImportLine",
    "queryKeyHint": "queryKeys.recipeImportLine.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- RecipeImportLine.confirmNew ---
export type RecipeImportLineConfirmNewClientInput = Record<string, never>;

export const RecipeImportLineConfirmNewCapability = {
  capabilityId: "RecipeImportLine.confirmNew",
  entity: "RecipeImportLine",
  command: "confirmNew",
  route: "/api/manifest/RecipeImportLine/commands/confirmNew",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["RecipeImportLineNewConfirmed"],
} as const;

/**
 * Build command input for RecipeImportLine.confirmNew.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeImportLineConfirmNewInput(client: RecipeImportLineConfirmNewClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful RecipeImportLine.confirmNew. */
export const RecipeImportLineConfirmNewInvalidation = [
  {
    "kind": "entityList",
    "entity": "RecipeImportLine",
    "queryKeyHint": "queryKeys.recipeImportLine.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "RecipeImportLine",
    "queryKeyHint": "queryKeys.recipeImportLine.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- RecipeImportLine.discard ---
export interface RecipeImportLineDiscardClientInput {
  reason: string;
}

export const RecipeImportLineDiscardCapability = {
  capabilityId: "RecipeImportLine.discard",
  entity: "RecipeImportLine",
  command: "discard",
  route: "/api/manifest/RecipeImportLine/commands/discard",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["RecipeImportLineDiscarded"],
} as const;

/**
 * Build command input for RecipeImportLine.discard.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeImportLineDiscardInput(client: RecipeImportLineDiscardClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful RecipeImportLine.discard. */
export const RecipeImportLineDiscardInvalidation = [
  {
    "kind": "entityList",
    "entity": "RecipeImportLine",
    "queryKeyHint": "queryKeys.recipeImportLine.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "RecipeImportLine",
    "queryKeyHint": "queryKeys.recipeImportLine.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- RecipeImportLine.markNew ---
export type RecipeImportLineMarkNewClientInput = Record<string, never>;

export const RecipeImportLineMarkNewCapability = {
  capabilityId: "RecipeImportLine.markNew",
  entity: "RecipeImportLine",
  command: "markNew",
  route: "/api/manifest/RecipeImportLine/commands/markNew",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["RecipeImportLineMarkedNew"],
} as const;

/**
 * Build command input for RecipeImportLine.markNew.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeImportLineMarkNewInput(client: RecipeImportLineMarkNewClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful RecipeImportLine.markNew. */
export const RecipeImportLineMarkNewInvalidation = [
  {
    "kind": "entityList",
    "entity": "RecipeImportLine",
    "queryKeyHint": "queryKeys.recipeImportLine.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "RecipeImportLine",
    "queryKeyHint": "queryKeys.recipeImportLine.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- RecipeImportLine.resetResolution ---
export type RecipeImportLineResetResolutionClientInput = Record<string, never>;

export const RecipeImportLineResetResolutionCapability = {
  capabilityId: "RecipeImportLine.resetResolution",
  entity: "RecipeImportLine",
  command: "resetResolution",
  route: "/api/manifest/RecipeImportLine/commands/resetResolution",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["RecipeImportLineResolutionReset"],
} as const;

/**
 * Build command input for RecipeImportLine.resetResolution.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeImportLineResetResolutionInput(client: RecipeImportLineResetResolutionClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful RecipeImportLine.resetResolution. */
export const RecipeImportLineResetResolutionInvalidation = [
  {
    "kind": "entityList",
    "entity": "RecipeImportLine",
    "queryKeyHint": "queryKeys.recipeImportLine.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "RecipeImportLine",
    "queryKeyHint": "queryKeys.recipeImportLine.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- RecipeImportLine.stage ---
export interface RecipeImportLineStageClientInput {
  importId: string;
  /** Bounds: 0..∞ */
  sourceOrder: number;
  sourceLine: string;
  parsedQuantity?: number;
  /** Allowed: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion" */
  parsedUnit?: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion";
  parsedIngredientName?: string;
  preparationNote?: string;
}

export const RecipeImportLineStageCapability = {
  capabilityId: "RecipeImportLine.stage",
  entity: "RecipeImportLine",
  command: "stage",
  route: "/api/manifest/RecipeImportLine/commands/stage",
  instanceCommand: true,
  clientParameterNames: ["importId","sourceOrder","sourceLine","parsedQuantity","parsedUnit","parsedIngredientName","preparationNote"],
  serverParameterNames: [],
  emits: ["RecipeImportLineStaged"],
} as const;

/**
 * Build command input for RecipeImportLine.stage.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeImportLineStageInput(client: RecipeImportLineStageClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful RecipeImportLine.stage. */
export const RecipeImportLineStageInvalidation = [
  {
    "kind": "entityList",
    "entity": "RecipeImportLine",
    "queryKeyHint": "queryKeys.recipeImportLine.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "RecipeImportLine",
    "queryKeyHint": "queryKeys.recipeImportLine.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- RecipeImportLine.suggestExactMatch ---
export interface RecipeImportLineSuggestExactMatchClientInput {
  matchedIngredientId: string;
}

export const RecipeImportLineSuggestExactMatchCapability = {
  capabilityId: "RecipeImportLine.suggestExactMatch",
  entity: "RecipeImportLine",
  command: "suggestExactMatch",
  route: "/api/manifest/RecipeImportLine/commands/suggestExactMatch",
  instanceCommand: true,
  clientParameterNames: ["matchedIngredientId"],
  serverParameterNames: [],
  emits: ["RecipeImportLineExactMatchSuggested"],
} as const;

/**
 * Build command input for RecipeImportLine.suggestExactMatch.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeImportLineSuggestExactMatchInput(client: RecipeImportLineSuggestExactMatchClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful RecipeImportLine.suggestExactMatch. */
export const RecipeImportLineSuggestExactMatchInvalidation = [
  {
    "kind": "entityList",
    "entity": "RecipeImportLine",
    "queryKeyHint": "queryKeys.recipeImportLine.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "RecipeImportLine",
    "queryKeyHint": "queryKeys.recipeImportLine.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- RecipeImportLine.suggestPossibleMatches ---
export interface RecipeImportLineSuggestPossibleMatchesClientInput {
  possibleMatchIngredientIds: string[];
}

export const RecipeImportLineSuggestPossibleMatchesCapability = {
  capabilityId: "RecipeImportLine.suggestPossibleMatches",
  entity: "RecipeImportLine",
  command: "suggestPossibleMatches",
  route: "/api/manifest/RecipeImportLine/commands/suggestPossibleMatches",
  instanceCommand: true,
  clientParameterNames: ["possibleMatchIngredientIds"],
  serverParameterNames: [],
  emits: ["RecipeImportLinePossibleMatchesSuggested"],
} as const;

/**
 * Build command input for RecipeImportLine.suggestPossibleMatches.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeImportLineSuggestPossibleMatchesInput(client: RecipeImportLineSuggestPossibleMatchesClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful RecipeImportLine.suggestPossibleMatches. */
export const RecipeImportLineSuggestPossibleMatchesInvalidation = [
  {
    "kind": "entityList",
    "entity": "RecipeImportLine",
    "queryKeyHint": "queryKeys.recipeImportLine.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "RecipeImportLine",
    "queryKeyHint": "queryKeys.recipeImportLine.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- RecipeIngredient.add ---
export interface RecipeIngredientAddClientInput {
  recipeId: string;
  ingredientId: string;
  /** Bounds: 1..∞ */
  quantity: number;
  /** Allowed: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion" */
  unit: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion";
  sortOrder?: number;
  prepNotes?: string;
}

export const RecipeIngredientAddCapability = {
  capabilityId: "RecipeIngredient.add",
  entity: "RecipeIngredient",
  command: "add",
  route: "/api/manifest/RecipeIngredient/commands/add",
  instanceCommand: true,
  clientParameterNames: ["recipeId","ingredientId","quantity","unit","sortOrder","prepNotes"],
  serverParameterNames: [],
  emits: ["RecipeIngredientAdded"],
} as const;

/**
 * Build command input for RecipeIngredient.add.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeIngredientAddInput(client: RecipeIngredientAddClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful RecipeIngredient.add. */
export const RecipeIngredientAddInvalidation = [
  {
    "kind": "entityList",
    "entity": "RecipeIngredient",
    "queryKeyHint": "queryKeys.recipeIngredient.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "RecipeIngredient",
    "queryKeyHint": "queryKeys.recipeIngredient.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- RecipeIngredient.adjustQuantity ---
export interface RecipeIngredientAdjustQuantityClientInput {
  /** Bounds: 1..∞ */
  quantity: number;
  /** Allowed: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion" */
  unit: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion";
}

export const RecipeIngredientAdjustQuantityCapability = {
  capabilityId: "RecipeIngredient.adjustQuantity",
  entity: "RecipeIngredient",
  command: "adjustQuantity",
  route: "/api/manifest/RecipeIngredient/commands/adjustQuantity",
  instanceCommand: true,
  clientParameterNames: ["quantity","unit"],
  serverParameterNames: [],
  emits: ["RecipeIngredientQuantityAdjusted"],
} as const;

/**
 * Build command input for RecipeIngredient.adjustQuantity.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeIngredientAdjustQuantityInput(client: RecipeIngredientAdjustQuantityClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful RecipeIngredient.adjustQuantity. */
export const RecipeIngredientAdjustQuantityInvalidation = [
  {
    "kind": "entityList",
    "entity": "RecipeIngredient",
    "queryKeyHint": "queryKeys.recipeIngredient.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "RecipeIngredient",
    "queryKeyHint": "queryKeys.recipeIngredient.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- RecipeIngredient.remove ---
export interface RecipeIngredientRemoveClientInput {
  reason: string;
}

export const RecipeIngredientRemoveCapability = {
  capabilityId: "RecipeIngredient.remove",
  entity: "RecipeIngredient",
  command: "remove",
  route: "/api/manifest/RecipeIngredient/commands/remove",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["RecipeIngredientRemoved"],
} as const;

/**
 * Build command input for RecipeIngredient.remove.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeIngredientRemoveInput(client: RecipeIngredientRemoveClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful RecipeIngredient.remove. */
export const RecipeIngredientRemoveInvalidation = [
  {
    "kind": "entityList",
    "entity": "RecipeIngredient",
    "queryKeyHint": "queryKeys.recipeIngredient.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "RecipeIngredient",
    "queryKeyHint": "queryKeys.recipeIngredient.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- RecipeStep.add ---
export interface RecipeStepAddClientInput {
  recipeId: string;
  instruction: string;
  sortOrder?: number;
  /** Bounds: 0..∞ */
  durationMinutes?: number;
}

export const RecipeStepAddCapability = {
  capabilityId: "RecipeStep.add",
  entity: "RecipeStep",
  command: "add",
  route: "/api/manifest/RecipeStep/commands/add",
  instanceCommand: true,
  clientParameterNames: ["recipeId","instruction","sortOrder","durationMinutes"],
  serverParameterNames: [],
  emits: ["RecipeStepAdded"],
} as const;

/**
 * Build command input for RecipeStep.add.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeStepAddInput(client: RecipeStepAddClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful RecipeStep.add. */
export const RecipeStepAddInvalidation = [
  {
    "kind": "entityList",
    "entity": "RecipeStep",
    "queryKeyHint": "queryKeys.recipeStep.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "RecipeStep",
    "queryKeyHint": "queryKeys.recipeStep.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- RecipeStep.remove ---
export interface RecipeStepRemoveClientInput {
  reason: string;
}

export const RecipeStepRemoveCapability = {
  capabilityId: "RecipeStep.remove",
  entity: "RecipeStep",
  command: "remove",
  route: "/api/manifest/RecipeStep/commands/remove",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["RecipeStepRemoved"],
} as const;

/**
 * Build command input for RecipeStep.remove.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeStepRemoveInput(client: RecipeStepRemoveClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful RecipeStep.remove. */
export const RecipeStepRemoveInvalidation = [
  {
    "kind": "entityList",
    "entity": "RecipeStep",
    "queryKeyHint": "queryKeys.recipeStep.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "RecipeStep",
    "queryKeyHint": "queryKeys.recipeStep.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- RecipeStep.revise ---
export interface RecipeStepReviseClientInput {
  instruction: string;
  sortOrder?: number;
  /** Bounds: 0..∞ */
  durationMinutes?: number;
}

export const RecipeStepReviseCapability = {
  capabilityId: "RecipeStep.revise",
  entity: "RecipeStep",
  command: "revise",
  route: "/api/manifest/RecipeStep/commands/revise",
  instanceCommand: true,
  clientParameterNames: ["instruction","sortOrder","durationMinutes"],
  serverParameterNames: [],
  emits: ["RecipeStepRevised"],
} as const;

/**
 * Build command input for RecipeStep.revise.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindRecipeStepReviseInput(client: RecipeStepReviseClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful RecipeStep.revise. */
export const RecipeStepReviseInvalidation = [
  {
    "kind": "entityList",
    "entity": "RecipeStep",
    "queryKeyHint": "queryKeys.recipeStep.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "RecipeStep",
    "queryKeyHint": "queryKeys.recipeStep.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- SavedReportDefinition.archive ---
export type SavedReportDefinitionArchiveClientInput = Record<string, never>;

export const SavedReportDefinitionArchiveCapability = {
  capabilityId: "SavedReportDefinition.archive",
  entity: "SavedReportDefinition",
  command: "archive",
  route: "/api/manifest/SavedReportDefinition/commands/archive",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["SavedReportArchived"],
} as const;

/**
 * Build command input for SavedReportDefinition.archive.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindSavedReportDefinitionArchiveInput(client: SavedReportDefinitionArchiveClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful SavedReportDefinition.archive. */
export const SavedReportDefinitionArchiveInvalidation = [
  {
    "kind": "entityList",
    "entity": "SavedReportDefinition",
    "queryKeyHint": "queryKeys.savedReportDefinition.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "SavedReportDefinition",
    "queryKeyHint": "queryKeys.savedReportDefinition.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for SavedReportDefinition.archive. */
export const SavedReportDefinitionArchiveLifecycle = [
  {
    "property": "status",
    "from": "active",
    "to": "archived",
    "proven": true
  }
] as const;

// --- SavedReportDefinition.changeSharing ---
export interface SavedReportDefinitionChangeSharingClientInput {
  /** Allowed: "owner_only" | "team" | "tenant_wide" */
  sharingScope: "owner_only" | "team" | "tenant_wide";
}

export const SavedReportDefinitionChangeSharingCapability = {
  capabilityId: "SavedReportDefinition.changeSharing",
  entity: "SavedReportDefinition",
  command: "changeSharing",
  route: "/api/manifest/SavedReportDefinition/commands/changeSharing",
  instanceCommand: true,
  clientParameterNames: ["sharingScope"],
  serverParameterNames: [],
  emits: ["SavedReportSharingChanged"],
} as const;

/**
 * Build command input for SavedReportDefinition.changeSharing.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindSavedReportDefinitionChangeSharingInput(client: SavedReportDefinitionChangeSharingClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful SavedReportDefinition.changeSharing. */
export const SavedReportDefinitionChangeSharingInvalidation = [
  {
    "kind": "entityList",
    "entity": "SavedReportDefinition",
    "queryKeyHint": "queryKeys.savedReportDefinition.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "SavedReportDefinition",
    "queryKeyHint": "queryKeys.savedReportDefinition.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- SavedReportDefinition.createDefinition ---
export interface SavedReportDefinitionCreateDefinitionClientInput {
  name: string;
  /** Allowed: "events" | "sales" | "inventory" | "production" | "workforce" | "logistics" | "finance" */
  subjectArea: "events" | "sales" | "inventory" | "production" | "workforce" | "logistics" | "finance";
  chartType: string;
  definition: unknown;
  /** Allowed: "owner_only" | "team" | "tenant_wide" */
  sharingScope?: "owner_only" | "team" | "tenant_wide";
}

export const SavedReportDefinitionCreateDefinitionCapability = {
  capabilityId: "SavedReportDefinition.createDefinition",
  entity: "SavedReportDefinition",
  command: "createDefinition",
  route: "/api/manifest/SavedReportDefinition/commands/createDefinition",
  instanceCommand: true,
  clientParameterNames: ["name","subjectArea","chartType","definition","sharingScope"],
  serverParameterNames: [],
  emits: ["SavedReportDefinitionCreated"],
} as const;

/**
 * Build command input for SavedReportDefinition.createDefinition.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindSavedReportDefinitionCreateDefinitionInput(client: SavedReportDefinitionCreateDefinitionClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful SavedReportDefinition.createDefinition. */
export const SavedReportDefinitionCreateDefinitionInvalidation = [
  {
    "kind": "entityList",
    "entity": "SavedReportDefinition",
    "queryKeyHint": "queryKeys.savedReportDefinition.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "SavedReportDefinition",
    "queryKeyHint": "queryKeys.savedReportDefinition.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- SavedReportDefinition.rename ---
export interface SavedReportDefinitionRenameClientInput {
  name: string;
}

export const SavedReportDefinitionRenameCapability = {
  capabilityId: "SavedReportDefinition.rename",
  entity: "SavedReportDefinition",
  command: "rename",
  route: "/api/manifest/SavedReportDefinition/commands/rename",
  instanceCommand: true,
  clientParameterNames: ["name"],
  serverParameterNames: [],
  emits: ["SavedReportRenamed"],
} as const;

/**
 * Build command input for SavedReportDefinition.rename.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindSavedReportDefinitionRenameInput(client: SavedReportDefinitionRenameClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful SavedReportDefinition.rename. */
export const SavedReportDefinitionRenameInvalidation = [
  {
    "kind": "entityList",
    "entity": "SavedReportDefinition",
    "queryKeyHint": "queryKeys.savedReportDefinition.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "SavedReportDefinition",
    "queryKeyHint": "queryKeys.savedReportDefinition.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- SavedReportDefinition.restore ---
export type SavedReportDefinitionRestoreClientInput = Record<string, never>;

export const SavedReportDefinitionRestoreCapability = {
  capabilityId: "SavedReportDefinition.restore",
  entity: "SavedReportDefinition",
  command: "restore",
  route: "/api/manifest/SavedReportDefinition/commands/restore",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["SavedReportRestored"],
} as const;

/**
 * Build command input for SavedReportDefinition.restore.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindSavedReportDefinitionRestoreInput(client: SavedReportDefinitionRestoreClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful SavedReportDefinition.restore. */
export const SavedReportDefinitionRestoreInvalidation = [
  {
    "kind": "entityList",
    "entity": "SavedReportDefinition",
    "queryKeyHint": "queryKeys.savedReportDefinition.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "SavedReportDefinition",
    "queryKeyHint": "queryKeys.savedReportDefinition.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for SavedReportDefinition.restore. */
export const SavedReportDefinitionRestoreLifecycle = [
  {
    "property": "status",
    "from": "archived",
    "to": "active",
    "proven": true
  }
] as const;

// --- SavedReportDefinition.updateDefinition ---
export interface SavedReportDefinitionUpdateDefinitionClientInput {
  chartType?: string;
  definition?: unknown;
  /** Allowed: "events" | "sales" | "inventory" | "production" | "workforce" | "logistics" | "finance" */
  subjectArea?: "events" | "sales" | "inventory" | "production" | "workforce" | "logistics" | "finance";
}

export const SavedReportDefinitionUpdateDefinitionCapability = {
  capabilityId: "SavedReportDefinition.updateDefinition",
  entity: "SavedReportDefinition",
  command: "updateDefinition",
  route: "/api/manifest/SavedReportDefinition/commands/updateDefinition",
  instanceCommand: true,
  clientParameterNames: ["chartType","definition","subjectArea"],
  serverParameterNames: [],
  emits: ["SavedReportDefinitionUpdated"],
} as const;

/**
 * Build command input for SavedReportDefinition.updateDefinition.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindSavedReportDefinitionUpdateDefinitionInput(client: SavedReportDefinitionUpdateDefinitionClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful SavedReportDefinition.updateDefinition. */
export const SavedReportDefinitionUpdateDefinitionInvalidation = [
  {
    "kind": "entityList",
    "entity": "SavedReportDefinition",
    "queryKeyHint": "queryKeys.savedReportDefinition.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "SavedReportDefinition",
    "queryKeyHint": "queryKeys.savedReportDefinition.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Shift.cancel ---
export interface ShiftCancelClientInput {
  reason: string;
}

export const ShiftCancelCapability = {
  capabilityId: "Shift.cancel",
  entity: "Shift",
  command: "cancel",
  route: "/api/manifest/Shift/commands/cancel",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["ShiftCancelled"],
} as const;

/**
 * Build command input for Shift.cancel.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindShiftCancelInput(client: ShiftCancelClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Shift.cancel. */
export const ShiftCancelInvalidation = [
  {
    "kind": "entityList",
    "entity": "Shift",
    "queryKeyHint": "queryKeys.shift.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Shift",
    "queryKeyHint": "queryKeys.shift.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Shift.cancel. */
export const ShiftCancelLifecycle = [
  {
    "property": "status",
    "from": "scheduled",
    "to": "cancelled",
    "proven": true
  },
  {
    "property": "status",
    "from": "started",
    "to": "cancelled",
    "proven": true
  }
] as const;

// --- Shift.complete ---
export type ShiftCompleteClientInput = Record<string, never>;

export const ShiftCompleteCapability = {
  capabilityId: "Shift.complete",
  entity: "Shift",
  command: "complete",
  route: "/api/manifest/Shift/commands/complete",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["ShiftCompleted"],
} as const;

/**
 * Build command input for Shift.complete.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindShiftCompleteInput(client: ShiftCompleteClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Shift.complete. */
export const ShiftCompleteInvalidation = [
  {
    "kind": "entityList",
    "entity": "Shift",
    "queryKeyHint": "queryKeys.shift.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Shift",
    "queryKeyHint": "queryKeys.shift.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Shift.complete. */
export const ShiftCompleteLifecycle = [
  {
    "property": "status",
    "from": "started",
    "to": "completed",
    "proven": true
  }
] as const;

// --- Shift.markNoShow ---
export type ShiftMarkNoShowClientInput = Record<string, never>;

export const ShiftMarkNoShowCapability = {
  capabilityId: "Shift.markNoShow",
  entity: "Shift",
  command: "markNoShow",
  route: "/api/manifest/Shift/commands/markNoShow",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["ShiftNoShowMarked"],
} as const;

/**
 * Build command input for Shift.markNoShow.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindShiftMarkNoShowInput(client: ShiftMarkNoShowClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Shift.markNoShow. */
export const ShiftMarkNoShowInvalidation = [
  {
    "kind": "entityList",
    "entity": "Shift",
    "queryKeyHint": "queryKeys.shift.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Shift",
    "queryKeyHint": "queryKeys.shift.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Shift.markNoShow. */
export const ShiftMarkNoShowLifecycle = [
  {
    "property": "status",
    "from": "scheduled",
    "to": "no_show",
    "proven": true
  },
  {
    "property": "status",
    "from": "started",
    "to": "no_show",
    "proven": true
  }
] as const;

// --- Shift.schedule ---
export interface ShiftScheduleClientInput {
  personId: string;
  /** Must not be "". */
  startsAt: string & { readonly __nonEmpty?: true };
  /** Must not be "". */
  endsAt: string & { readonly __nonEmpty?: true };
  eventId?: string;
  role?: string;
  notes?: string;
}

export const ShiftScheduleCapability = {
  capabilityId: "Shift.schedule",
  entity: "Shift",
  command: "schedule",
  route: "/api/manifest/Shift/commands/schedule",
  instanceCommand: true,
  clientParameterNames: ["personId","startsAt","endsAt","eventId","role","notes"],
  serverParameterNames: [],
  emits: ["ShiftScheduled"],
} as const;

/**
 * Build command input for Shift.schedule.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindShiftScheduleInput(client: ShiftScheduleClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Shift.schedule. */
export const ShiftScheduleInvalidation = [
  {
    "kind": "entityList",
    "entity": "Shift",
    "queryKeyHint": "queryKeys.shift.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Shift",
    "queryKeyHint": "queryKeys.shift.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Shift.start ---
export type ShiftStartClientInput = Record<string, never>;

export const ShiftStartCapability = {
  capabilityId: "Shift.start",
  entity: "Shift",
  command: "start",
  route: "/api/manifest/Shift/commands/start",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["ShiftStarted"],
} as const;

/**
 * Build command input for Shift.start.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindShiftStartInput(client: ShiftStartClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Shift.start. */
export const ShiftStartInvalidation = [
  {
    "kind": "entityList",
    "entity": "Shift",
    "queryKeyHint": "queryKeys.shift.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Shift",
    "queryKeyHint": "queryKeys.shift.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Shift.start. */
export const ShiftStartLifecycle = [
  {
    "property": "status",
    "from": "scheduled",
    "to": "started",
    "proven": true
  }
] as const;

// --- StorageLocation.activate ---
export type StorageLocationActivateClientInput = Record<string, never>;

export const StorageLocationActivateCapability = {
  capabilityId: "StorageLocation.activate",
  entity: "StorageLocation",
  command: "activate",
  route: "/api/manifest/StorageLocation/commands/activate",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["StorageLocationActivated"],
} as const;

/**
 * Build command input for StorageLocation.activate.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindStorageLocationActivateInput(client: StorageLocationActivateClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful StorageLocation.activate. */
export const StorageLocationActivateInvalidation = [
  {
    "kind": "entityList",
    "entity": "StorageLocation",
    "queryKeyHint": "queryKeys.storageLocation.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "StorageLocation",
    "queryKeyHint": "queryKeys.storageLocation.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for StorageLocation.activate. */
export const StorageLocationActivateLifecycle = [
  {
    "property": "status",
    "from": "inactive",
    "to": "active",
    "proven": true
  }
] as const;

// --- StorageLocation.deactivate ---
export interface StorageLocationDeactivateClientInput {
  reason: string;
}

export const StorageLocationDeactivateCapability = {
  capabilityId: "StorageLocation.deactivate",
  entity: "StorageLocation",
  command: "deactivate",
  route: "/api/manifest/StorageLocation/commands/deactivate",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["StorageLocationDeactivated"],
} as const;

/**
 * Build command input for StorageLocation.deactivate.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindStorageLocationDeactivateInput(client: StorageLocationDeactivateClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful StorageLocation.deactivate. */
export const StorageLocationDeactivateInvalidation = [
  {
    "kind": "entityList",
    "entity": "StorageLocation",
    "queryKeyHint": "queryKeys.storageLocation.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "StorageLocation",
    "queryKeyHint": "queryKeys.storageLocation.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for StorageLocation.deactivate. */
export const StorageLocationDeactivateLifecycle = [
  {
    "property": "status",
    "from": "active",
    "to": "inactive",
    "proven": true
  }
] as const;

// --- StorageLocation.register ---
export interface StorageLocationRegisterClientInput {
  name: string;
  locationType?: string;
  temperatureZone?: string;
  minTemperature?: number;
  maxTemperature?: number;
  temperatureUnit?: string;
}

export const StorageLocationRegisterCapability = {
  capabilityId: "StorageLocation.register",
  entity: "StorageLocation",
  command: "register",
  route: "/api/manifest/StorageLocation/commands/register",
  instanceCommand: true,
  clientParameterNames: ["name","locationType","temperatureZone","minTemperature","maxTemperature","temperatureUnit"],
  serverParameterNames: [],
  emits: ["StorageLocationRegistered"],
} as const;

/**
 * Build command input for StorageLocation.register.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindStorageLocationRegisterInput(client: StorageLocationRegisterClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful StorageLocation.register. */
export const StorageLocationRegisterInvalidation = [
  {
    "kind": "entityList",
    "entity": "StorageLocation",
    "queryKeyHint": "queryKeys.storageLocation.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "StorageLocation",
    "queryKeyHint": "queryKeys.storageLocation.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- StorageLocation.reviseDetails ---
export interface StorageLocationReviseDetailsClientInput {
  name: string;
  locationType?: string;
  temperatureZone?: string;
  minTemperature?: number;
  maxTemperature?: number;
  temperatureUnit?: string;
}

export const StorageLocationReviseDetailsCapability = {
  capabilityId: "StorageLocation.reviseDetails",
  entity: "StorageLocation",
  command: "reviseDetails",
  route: "/api/manifest/StorageLocation/commands/reviseDetails",
  instanceCommand: true,
  clientParameterNames: ["name","locationType","temperatureZone","minTemperature","maxTemperature","temperatureUnit"],
  serverParameterNames: [],
  emits: ["StorageLocationDetailsRevised"],
} as const;

/**
 * Build command input for StorageLocation.reviseDetails.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindStorageLocationReviseDetailsInput(client: StorageLocationReviseDetailsClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful StorageLocation.reviseDetails. */
export const StorageLocationReviseDetailsInvalidation = [
  {
    "kind": "entityList",
    "entity": "StorageLocation",
    "queryKeyHint": "queryKeys.storageLocation.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "StorageLocation",
    "queryKeyHint": "queryKeys.storageLocation.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- TimeRecord.clockIn ---
export interface TimeRecordClockInClientInput {
  personId: string;
  shiftId?: string;
  eventId?: string;
  notes?: string;
}

export const TimeRecordClockInCapability = {
  capabilityId: "TimeRecord.clockIn",
  entity: "TimeRecord",
  command: "clockIn",
  route: "/api/manifest/TimeRecord/commands/clockIn",
  instanceCommand: true,
  clientParameterNames: ["personId","shiftId","eventId","notes"],
  serverParameterNames: [],
  emits: ["TimeRecordClockedIn"],
} as const;

/**
 * Build command input for TimeRecord.clockIn.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindTimeRecordClockInInput(client: TimeRecordClockInClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful TimeRecord.clockIn. */
export const TimeRecordClockInInvalidation = [
  {
    "kind": "entityList",
    "entity": "TimeRecord",
    "queryKeyHint": "queryKeys.timeRecord.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "TimeRecord",
    "queryKeyHint": "queryKeys.timeRecord.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- TimeRecord.clockOut ---
export interface TimeRecordClockOutClientInput {
  /** Bounds: 0..∞ */
  breakMinutes?: number;
  notes?: string;
}

export const TimeRecordClockOutCapability = {
  capabilityId: "TimeRecord.clockOut",
  entity: "TimeRecord",
  command: "clockOut",
  route: "/api/manifest/TimeRecord/commands/clockOut",
  instanceCommand: true,
  clientParameterNames: ["breakMinutes","notes"],
  serverParameterNames: [],
  emits: ["TimeRecordClockedOut"],
} as const;

/**
 * Build command input for TimeRecord.clockOut.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindTimeRecordClockOutInput(client: TimeRecordClockOutClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful TimeRecord.clockOut. */
export const TimeRecordClockOutInvalidation = [
  {
    "kind": "entityList",
    "entity": "TimeRecord",
    "queryKeyHint": "queryKeys.timeRecord.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "TimeRecord",
    "queryKeyHint": "queryKeys.timeRecord.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for TimeRecord.clockOut. */
export const TimeRecordClockOutLifecycle = [
  {
    "property": "status",
    "from": "open",
    "to": "closed",
    "proven": true
  }
] as const;

// --- TimeRecord.correct ---
export interface TimeRecordCorrectClientInput {
  /** Must not be "". */
  clockInAt: string & { readonly __nonEmpty?: true };
  /** Must not be "". */
  clockOutAt: string & { readonly __nonEmpty?: true };
  /** Bounds: 0..∞ */
  breakMinutes?: number;
  notes?: string;
}

export const TimeRecordCorrectCapability = {
  capabilityId: "TimeRecord.correct",
  entity: "TimeRecord",
  command: "correct",
  route: "/api/manifest/TimeRecord/commands/correct",
  instanceCommand: true,
  clientParameterNames: ["clockInAt","clockOutAt","breakMinutes","notes"],
  serverParameterNames: [],
  emits: ["TimeRecordCorrected"],
} as const;

/**
 * Build command input for TimeRecord.correct.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindTimeRecordCorrectInput(client: TimeRecordCorrectClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful TimeRecord.correct. */
export const TimeRecordCorrectInvalidation = [
  {
    "kind": "entityList",
    "entity": "TimeRecord",
    "queryKeyHint": "queryKeys.timeRecord.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "TimeRecord",
    "queryKeyHint": "queryKeys.timeRecord.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for TimeRecord.correct. */
export const TimeRecordCorrectLifecycle = [
  {
    "property": "status",
    "from": "closed",
    "to": "corrected",
    "proven": true
  },
  {
    "property": "status",
    "from": "corrected",
    "to": "corrected",
    "proven": true
  }
] as const;

// --- Vendor.onboard ---
export interface VendorOnboardClientInput {
  name: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  countryCode?: string;
  /** Bounds: 0..365 */
  paymentTermsDays?: number;
  notes?: string;
}

export const VendorOnboardCapability = {
  capabilityId: "Vendor.onboard",
  entity: "Vendor",
  command: "onboard",
  route: "/api/manifest/Vendor/commands/onboard",
  instanceCommand: true,
  clientParameterNames: ["name","email","phone","addressLine1","city","region","postalCode","countryCode","paymentTermsDays","notes"],
  serverParameterNames: [],
  emits: ["VendorOnboarded"],
} as const;

/**
 * Build command input for Vendor.onboard.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindVendorOnboardInput(client: VendorOnboardClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Vendor.onboard. */
export const VendorOnboardInvalidation = [
  {
    "kind": "entityList",
    "entity": "Vendor",
    "queryKeyHint": "queryKeys.vendor.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Vendor",
    "queryKeyHint": "queryKeys.vendor.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Vendor.reinstate ---
export type VendorReinstateClientInput = Record<string, never>;

export const VendorReinstateCapability = {
  capabilityId: "Vendor.reinstate",
  entity: "Vendor",
  command: "reinstate",
  route: "/api/manifest/Vendor/commands/reinstate",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["VendorReinstated"],
} as const;

/**
 * Build command input for Vendor.reinstate.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindVendorReinstateInput(client: VendorReinstateClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Vendor.reinstate. */
export const VendorReinstateInvalidation = [
  {
    "kind": "entityList",
    "entity": "Vendor",
    "queryKeyHint": "queryKeys.vendor.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Vendor",
    "queryKeyHint": "queryKeys.vendor.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Vendor.reinstate. */
export const VendorReinstateLifecycle = [
  {
    "property": "status",
    "from": "suspended",
    "to": "active",
    "proven": true
  }
] as const;

// --- Vendor.suspend ---
export interface VendorSuspendClientInput {
  reason: string;
}

export const VendorSuspendCapability = {
  capabilityId: "Vendor.suspend",
  entity: "Vendor",
  command: "suspend",
  route: "/api/manifest/Vendor/commands/suspend",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["VendorSuspended"],
} as const;

/**
 * Build command input for Vendor.suspend.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindVendorSuspendInput(client: VendorSuspendClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Vendor.suspend. */
export const VendorSuspendInvalidation = [
  {
    "kind": "entityList",
    "entity": "Vendor",
    "queryKeyHint": "queryKeys.vendor.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Vendor",
    "queryKeyHint": "queryKeys.vendor.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Vendor.suspend. */
export const VendorSuspendLifecycle = [
  {
    "property": "status",
    "from": "active",
    "to": "suspended",
    "proven": true
  }
] as const;

// --- Vendor.terminate ---
export interface VendorTerminateClientInput {
  reason: string;
}

export const VendorTerminateCapability = {
  capabilityId: "Vendor.terminate",
  entity: "Vendor",
  command: "terminate",
  route: "/api/manifest/Vendor/commands/terminate",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["VendorTerminated"],
} as const;

/**
 * Build command input for Vendor.terminate.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindVendorTerminateInput(client: VendorTerminateClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Vendor.terminate. */
export const VendorTerminateInvalidation = [
  {
    "kind": "entityList",
    "entity": "Vendor",
    "queryKeyHint": "queryKeys.vendor.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Vendor",
    "queryKeyHint": "queryKeys.vendor.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Vendor.terminate. */
export const VendorTerminateLifecycle = [
  {
    "property": "status",
    "from": "active",
    "to": "terminated",
    "proven": true
  },
  {
    "property": "status",
    "from": "suspended",
    "to": "terminated",
    "proven": true
  }
] as const;

// --- Vendor.updateDetails ---
export interface VendorUpdateDetailsClientInput {
  name: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  countryCode?: string;
  /** Bounds: 0..365 */
  paymentTermsDays?: number;
  notes?: string;
}

export const VendorUpdateDetailsCapability = {
  capabilityId: "Vendor.updateDetails",
  entity: "Vendor",
  command: "updateDetails",
  route: "/api/manifest/Vendor/commands/updateDetails",
  instanceCommand: true,
  clientParameterNames: ["name","email","phone","addressLine1","city","region","postalCode","countryCode","paymentTermsDays","notes"],
  serverParameterNames: [],
  emits: ["VendorDetailsUpdated"],
} as const;

/**
 * Build command input for Vendor.updateDetails.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindVendorUpdateDetailsInput(client: VendorUpdateDetailsClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Vendor.updateDetails. */
export const VendorUpdateDetailsInvalidation = [
  {
    "kind": "entityList",
    "entity": "Vendor",
    "queryKeyHint": "queryKeys.vendor.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Vendor",
    "queryKeyHint": "queryKeys.vendor.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- VendorOrder.cancel ---
export interface VendorOrderCancelClientInput {
  reason: string;
}

export const VendorOrderCancelCapability = {
  capabilityId: "VendorOrder.cancel",
  entity: "VendorOrder",
  command: "cancel",
  route: "/api/manifest/VendorOrder/commands/cancel",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["VendorOrderCancelled"],
} as const;

/**
 * Build command input for VendorOrder.cancel.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindVendorOrderCancelInput(client: VendorOrderCancelClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful VendorOrder.cancel. */
export const VendorOrderCancelInvalidation = [
  {
    "kind": "entityList",
    "entity": "VendorOrder",
    "queryKeyHint": "queryKeys.vendorOrder.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "VendorOrder",
    "queryKeyHint": "queryKeys.vendorOrder.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for VendorOrder.cancel. */
export const VendorOrderCancelLifecycle = [
  {
    "property": "status",
    "from": "draft",
    "to": "cancelled",
    "proven": true
  },
  {
    "property": "status",
    "from": "submitted",
    "to": "cancelled",
    "proven": true
  },
  {
    "property": "status",
    "from": "confirmed",
    "to": "cancelled",
    "proven": true
  },
  {
    "property": "status",
    "from": "partially_received",
    "to": "cancelled",
    "proven": true
  }
] as const;

// --- VendorOrder.confirm ---
export type VendorOrderConfirmClientInput = Record<string, never>;

export const VendorOrderConfirmCapability = {
  capabilityId: "VendorOrder.confirm",
  entity: "VendorOrder",
  command: "confirm",
  route: "/api/manifest/VendorOrder/commands/confirm",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["VendorOrderConfirmed"],
} as const;

/**
 * Build command input for VendorOrder.confirm.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindVendorOrderConfirmInput(client: VendorOrderConfirmClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful VendorOrder.confirm. */
export const VendorOrderConfirmInvalidation = [
  {
    "kind": "entityList",
    "entity": "VendorOrder",
    "queryKeyHint": "queryKeys.vendorOrder.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "VendorOrder",
    "queryKeyHint": "queryKeys.vendorOrder.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for VendorOrder.confirm. */
export const VendorOrderConfirmLifecycle = [
  {
    "property": "status",
    "from": "submitted",
    "to": "confirmed",
    "proven": true
  }
] as const;

// --- VendorOrder.markPartiallyReceived ---
export type VendorOrderMarkPartiallyReceivedClientInput = Record<string, never>;

export const VendorOrderMarkPartiallyReceivedCapability = {
  capabilityId: "VendorOrder.markPartiallyReceived",
  entity: "VendorOrder",
  command: "markPartiallyReceived",
  route: "/api/manifest/VendorOrder/commands/markPartiallyReceived",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["VendorOrderPartiallyReceived"],
} as const;

/**
 * Build command input for VendorOrder.markPartiallyReceived.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindVendorOrderMarkPartiallyReceivedInput(client: VendorOrderMarkPartiallyReceivedClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful VendorOrder.markPartiallyReceived. */
export const VendorOrderMarkPartiallyReceivedInvalidation = [
  {
    "kind": "entityList",
    "entity": "VendorOrder",
    "queryKeyHint": "queryKeys.vendorOrder.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "VendorOrder",
    "queryKeyHint": "queryKeys.vendorOrder.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for VendorOrder.markPartiallyReceived. */
export const VendorOrderMarkPartiallyReceivedLifecycle = [
  {
    "property": "status",
    "from": "confirmed",
    "to": "partially_received",
    "proven": true
  }
] as const;

// --- VendorOrder.markReceived ---
export type VendorOrderMarkReceivedClientInput = Record<string, never>;

export const VendorOrderMarkReceivedCapability = {
  capabilityId: "VendorOrder.markReceived",
  entity: "VendorOrder",
  command: "markReceived",
  route: "/api/manifest/VendorOrder/commands/markReceived",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["VendorOrderReceived"],
} as const;

/**
 * Build command input for VendorOrder.markReceived.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindVendorOrderMarkReceivedInput(client: VendorOrderMarkReceivedClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful VendorOrder.markReceived. */
export const VendorOrderMarkReceivedInvalidation = [
  {
    "kind": "entityList",
    "entity": "VendorOrder",
    "queryKeyHint": "queryKeys.vendorOrder.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "VendorOrder",
    "queryKeyHint": "queryKeys.vendorOrder.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for VendorOrder.markReceived. */
export const VendorOrderMarkReceivedLifecycle = [
  {
    "property": "status",
    "from": "confirmed",
    "to": "received",
    "proven": true
  },
  {
    "property": "status",
    "from": "partially_received",
    "to": "received",
    "proven": true
  }
] as const;

// --- VendorOrder.open ---
export interface VendorOrderOpenClientInput {
  vendorId: string;
  eventId?: string;
  sourceRangeStart?: string;
  sourceRangeEnd?: string;
  orderNumber?: string;
  notes?: string;
}

export const VendorOrderOpenCapability = {
  capabilityId: "VendorOrder.open",
  entity: "VendorOrder",
  command: "open",
  route: "/api/manifest/VendorOrder/commands/open",
  instanceCommand: true,
  clientParameterNames: ["vendorId","eventId","sourceRangeStart","sourceRangeEnd","orderNumber","notes"],
  serverParameterNames: [],
  emits: ["VendorOrderOpened"],
} as const;

/**
 * Build command input for VendorOrder.open.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindVendorOrderOpenInput(client: VendorOrderOpenClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful VendorOrder.open. */
export const VendorOrderOpenInvalidation = [
  {
    "kind": "entityList",
    "entity": "VendorOrder",
    "queryKeyHint": "queryKeys.vendorOrder.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "VendorOrder",
    "queryKeyHint": "queryKeys.vendorOrder.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- VendorOrder.submit ---
export type VendorOrderSubmitClientInput = Record<string, never>;

export const VendorOrderSubmitCapability = {
  capabilityId: "VendorOrder.submit",
  entity: "VendorOrder",
  command: "submit",
  route: "/api/manifest/VendorOrder/commands/submit",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["VendorOrderSubmitted"],
} as const;

/**
 * Build command input for VendorOrder.submit.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindVendorOrderSubmitInput(client: VendorOrderSubmitClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful VendorOrder.submit. */
export const VendorOrderSubmitInvalidation = [
  {
    "kind": "entityList",
    "entity": "VendorOrder",
    "queryKeyHint": "queryKeys.vendorOrder.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "VendorOrder",
    "queryKeyHint": "queryKeys.vendorOrder.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for VendorOrder.submit. */
export const VendorOrderSubmitLifecycle = [
  {
    "property": "status",
    "from": "draft",
    "to": "submitted",
    "proven": true
  }
] as const;

// --- VendorOrder.updateTotals ---
export interface VendorOrderUpdateTotalsClientInput {
  /** Bounds: 0..∞ */
  subtotal: number;
  /** Bounds: 0..∞ */
  taxAmount: number;
  /** Bounds: 0..∞ */
  shippingAmount: number;
}

export const VendorOrderUpdateTotalsCapability = {
  capabilityId: "VendorOrder.updateTotals",
  entity: "VendorOrder",
  command: "updateTotals",
  route: "/api/manifest/VendorOrder/commands/updateTotals",
  instanceCommand: true,
  clientParameterNames: ["subtotal","taxAmount","shippingAmount"],
  serverParameterNames: [],
  emits: ["VendorOrderTotalsUpdated"],
} as const;

/**
 * Build command input for VendorOrder.updateTotals.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindVendorOrderUpdateTotalsInput(client: VendorOrderUpdateTotalsClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful VendorOrder.updateTotals. */
export const VendorOrderUpdateTotalsInvalidation = [
  {
    "kind": "entityList",
    "entity": "VendorOrder",
    "queryKeyHint": "queryKeys.vendorOrder.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "VendorOrder",
    "queryKeyHint": "queryKeys.vendorOrder.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- VendorOrderLine.addLine ---
export interface VendorOrderLineAddLineClientInput {
  vendorOrderId: string;
  ingredientId: string;
  /** Bounds: 1..∞ */
  orderedQuantity: number;
  /** Allowed: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion" */
  unit: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion";
  /** Bounds: 0..∞ */
  unitCost: number;
  ingredientDemandId?: string;
  locationId?: string;
}

export const VendorOrderLineAddLineCapability = {
  capabilityId: "VendorOrderLine.addLine",
  entity: "VendorOrderLine",
  command: "addLine",
  route: "/api/manifest/VendorOrderLine/commands/addLine",
  instanceCommand: true,
  clientParameterNames: ["vendorOrderId","ingredientId","orderedQuantity","unit","unitCost","ingredientDemandId","locationId"],
  serverParameterNames: [],
  emits: ["VendorOrderLineAdded"],
} as const;

/**
 * Build command input for VendorOrderLine.addLine.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindVendorOrderLineAddLineInput(client: VendorOrderLineAddLineClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful VendorOrderLine.addLine. */
export const VendorOrderLineAddLineInvalidation = [
  {
    "kind": "entityList",
    "entity": "VendorOrderLine",
    "queryKeyHint": "queryKeys.vendorOrderLine.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "VendorOrderLine",
    "queryKeyHint": "queryKeys.vendorOrderLine.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for VendorOrderLine.addLine. */
export const VendorOrderLineAddLineLifecycle = [
  {
    "property": "status",
    "from": "pending",
    "to": "added",
    "proven": true
  }
] as const;

// --- VendorOrderLine.cancelLine ---
export interface VendorOrderLineCancelLineClientInput {
  reason: string;
}

export const VendorOrderLineCancelLineCapability = {
  capabilityId: "VendorOrderLine.cancelLine",
  entity: "VendorOrderLine",
  command: "cancelLine",
  route: "/api/manifest/VendorOrderLine/commands/cancelLine",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["VendorOrderLineCancelled"],
} as const;

/**
 * Build command input for VendorOrderLine.cancelLine.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindVendorOrderLineCancelLineInput(client: VendorOrderLineCancelLineClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful VendorOrderLine.cancelLine. */
export const VendorOrderLineCancelLineInvalidation = [
  {
    "kind": "entityList",
    "entity": "VendorOrderLine",
    "queryKeyHint": "queryKeys.vendorOrderLine.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "VendorOrderLine",
    "queryKeyHint": "queryKeys.vendorOrderLine.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for VendorOrderLine.cancelLine. */
export const VendorOrderLineCancelLineLifecycle = [
  {
    "property": "status",
    "from": "pending",
    "to": "cancelled",
    "proven": true
  },
  {
    "property": "status",
    "from": "added",
    "to": "cancelled",
    "proven": true
  },
  {
    "property": "status",
    "from": "receiving",
    "to": "cancelled",
    "proven": true
  }
] as const;

// --- VendorOrderLine.recordReceipt ---
export interface VendorOrderLineRecordReceiptClientInput {
  /** Bounds: 1..∞ */
  quantity: number;
  locationId: string;
  /** Bounds: 0..∞ */
  discrepancyQuantity?: number;
  discrepancyNotes?: string;
}

export const VendorOrderLineRecordReceiptCapability = {
  capabilityId: "VendorOrderLine.recordReceipt",
  entity: "VendorOrderLine",
  command: "recordReceipt",
  route: "/api/manifest/VendorOrderLine/commands/recordReceipt",
  instanceCommand: true,
  clientParameterNames: ["quantity","locationId","discrepancyQuantity","discrepancyNotes"],
  serverParameterNames: [],
  emits: ["VendorOrderLineReceived"],
} as const;

/**
 * Build command input for VendorOrderLine.recordReceipt.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindVendorOrderLineRecordReceiptInput(client: VendorOrderLineRecordReceiptClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful VendorOrderLine.recordReceipt. */
export const VendorOrderLineRecordReceiptInvalidation = [
  {
    "kind": "entityList",
    "entity": "VendorOrderLine",
    "queryKeyHint": "queryKeys.vendorOrderLine.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "VendorOrderLine",
    "queryKeyHint": "queryKeys.vendorOrderLine.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- VendorOrderLine.reviseQuantity ---
export interface VendorOrderLineReviseQuantityClientInput {
  /** Bounds: 1..∞ */
  orderedQuantity: number;
  /** Bounds: 0..∞ */
  unitCost?: number;
}

export const VendorOrderLineReviseQuantityCapability = {
  capabilityId: "VendorOrderLine.reviseQuantity",
  entity: "VendorOrderLine",
  command: "reviseQuantity",
  route: "/api/manifest/VendorOrderLine/commands/reviseQuantity",
  instanceCommand: true,
  clientParameterNames: ["orderedQuantity","unitCost"],
  serverParameterNames: [],
  emits: ["VendorOrderLineQuantityRevised"],
} as const;

/**
 * Build command input for VendorOrderLine.reviseQuantity.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindVendorOrderLineReviseQuantityInput(client: VendorOrderLineReviseQuantityClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful VendorOrderLine.reviseQuantity. */
export const VendorOrderLineReviseQuantityInvalidation = [
  {
    "kind": "entityList",
    "entity": "VendorOrderLine",
    "queryKeyHint": "queryKeys.vendorOrderLine.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "VendorOrderLine",
    "queryKeyHint": "queryKeys.vendorOrderLine.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- VendorOrderLineDemand.link ---
export interface VendorOrderLineDemandLinkClientInput {
  vendorOrderLineId: string;
  ingredientDemandId: string;
  /** Bounds: 1..∞ */
  contributionQuantity: number;
  /** Allowed: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion" */
  unit: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion";
}

export const VendorOrderLineDemandLinkCapability = {
  capabilityId: "VendorOrderLineDemand.link",
  entity: "VendorOrderLineDemand",
  command: "link",
  route: "/api/manifest/VendorOrderLineDemand/commands/link",
  instanceCommand: true,
  clientParameterNames: ["vendorOrderLineId","ingredientDemandId","contributionQuantity","unit"],
  serverParameterNames: [],
  emits: ["VendorOrderLineDemandLinked"],
} as const;

/**
 * Build command input for VendorOrderLineDemand.link.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindVendorOrderLineDemandLinkInput(client: VendorOrderLineDemandLinkClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful VendorOrderLineDemand.link. */
export const VendorOrderLineDemandLinkInvalidation = [
  {
    "kind": "entityList",
    "entity": "VendorOrderLineDemand",
    "queryKeyHint": "queryKeys.vendorOrderLineDemand.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "VendorOrderLineDemand",
    "queryKeyHint": "queryKeys.vendorOrderLineDemand.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- VendorOrderLineDemand.retire ---
export interface VendorOrderLineDemandRetireClientInput {
  reason: string;
}

export const VendorOrderLineDemandRetireCapability = {
  capabilityId: "VendorOrderLineDemand.retire",
  entity: "VendorOrderLineDemand",
  command: "retire",
  route: "/api/manifest/VendorOrderLineDemand/commands/retire",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["VendorOrderLineDemandRetired"],
} as const;

/**
 * Build command input for VendorOrderLineDemand.retire.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindVendorOrderLineDemandRetireInput(client: VendorOrderLineDemandRetireClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful VendorOrderLineDemand.retire. */
export const VendorOrderLineDemandRetireInvalidation = [
  {
    "kind": "entityList",
    "entity": "VendorOrderLineDemand",
    "queryKeyHint": "queryKeys.vendorOrderLineDemand.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "VendorOrderLineDemand",
    "queryKeyHint": "queryKeys.vendorOrderLineDemand.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- VendorOrderLineDemand.revise ---
export interface VendorOrderLineDemandReviseClientInput {
  /** Bounds: 1..∞ */
  contributionQuantity: number;
}

export const VendorOrderLineDemandReviseCapability = {
  capabilityId: "VendorOrderLineDemand.revise",
  entity: "VendorOrderLineDemand",
  command: "revise",
  route: "/api/manifest/VendorOrderLineDemand/commands/revise",
  instanceCommand: true,
  clientParameterNames: ["contributionQuantity"],
  serverParameterNames: [],
  emits: ["VendorOrderLineDemandRevised"],
} as const;

/**
 * Build command input for VendorOrderLineDemand.revise.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindVendorOrderLineDemandReviseInput(client: VendorOrderLineDemandReviseClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful VendorOrderLineDemand.revise. */
export const VendorOrderLineDemandReviseInvalidation = [
  {
    "kind": "entityList",
    "entity": "VendorOrderLineDemand",
    "queryKeyHint": "queryKeys.vendorOrderLineDemand.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "VendorOrderLineDemand",
    "queryKeyHint": "queryKeys.vendorOrderLineDemand.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Venue.activate ---
export type VenueActivateClientInput = Record<string, never>;

export const VenueActivateCapability = {
  capabilityId: "Venue.activate",
  entity: "Venue",
  command: "activate",
  route: "/api/manifest/Venue/commands/activate",
  instanceCommand: true,
  clientParameterNames: [],
  serverParameterNames: [],
  emits: ["VenueActivated"],
} as const;

/**
 * Build command input for Venue.activate.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindVenueActivateInput(client: VenueActivateClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Venue.activate. */
export const VenueActivateInvalidation = [
  {
    "kind": "entityList",
    "entity": "Venue",
    "queryKeyHint": "queryKeys.venue.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Venue",
    "queryKeyHint": "queryKeys.venue.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Venue.activate. */
export const VenueActivateLifecycle = [
  {
    "property": "status",
    "from": "inactive",
    "to": "active",
    "proven": true
  }
] as const;

// --- Venue.changeCapacity ---
export interface VenueChangeCapacityClientInput {
  /** Bounds: 0..∞ */
  capacity: number;
}

export const VenueChangeCapacityCapability = {
  capabilityId: "Venue.changeCapacity",
  entity: "Venue",
  command: "changeCapacity",
  route: "/api/manifest/Venue/commands/changeCapacity",
  instanceCommand: true,
  clientParameterNames: ["capacity"],
  serverParameterNames: [],
  emits: ["VenueCapacityChanged"],
} as const;

/**
 * Build command input for Venue.changeCapacity.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindVenueChangeCapacityInput(client: VenueChangeCapacityClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Venue.changeCapacity. */
export const VenueChangeCapacityInvalidation = [
  {
    "kind": "entityList",
    "entity": "Venue",
    "queryKeyHint": "queryKeys.venue.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Venue",
    "queryKeyHint": "queryKeys.venue.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Venue.deactivate ---
export interface VenueDeactivateClientInput {
  reason: string;
}

export const VenueDeactivateCapability = {
  capabilityId: "Venue.deactivate",
  entity: "Venue",
  command: "deactivate",
  route: "/api/manifest/Venue/commands/deactivate",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["VenueDeactivated"],
} as const;

/**
 * Build command input for Venue.deactivate.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindVenueDeactivateInput(client: VenueDeactivateClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Venue.deactivate. */
export const VenueDeactivateInvalidation = [
  {
    "kind": "entityList",
    "entity": "Venue",
    "queryKeyHint": "queryKeys.venue.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Venue",
    "queryKeyHint": "queryKeys.venue.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for Venue.deactivate. */
export const VenueDeactivateLifecycle = [
  {
    "property": "status",
    "from": "active",
    "to": "inactive",
    "proven": true
  }
] as const;

// --- Venue.register ---
export interface VenueRegisterClientInput {
  name: string;
  /** Allowed: "client_site" | "banquet_hall" | "outdoor" | "office" | "private_home" | "other" */
  venueType: "client_site" | "banquet_hall" | "outdoor" | "office" | "private_home" | "other";
  /** Bounds: 0..∞ */
  capacity: number;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  countryCode?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  accessNotes?: string;
  cateringNotes?: string;
}

export const VenueRegisterCapability = {
  capabilityId: "Venue.register",
  entity: "Venue",
  command: "register",
  route: "/api/manifest/Venue/commands/register",
  instanceCommand: true,
  clientParameterNames: ["name","venueType","capacity","addressLine1","addressLine2","city","region","postalCode","countryCode","contactName","contactEmail","contactPhone","accessNotes","cateringNotes"],
  serverParameterNames: [],
  emits: ["VenueRegistered"],
} as const;

/**
 * Build command input for Venue.register.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindVenueRegisterInput(client: VenueRegisterClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Venue.register. */
export const VenueRegisterInvalidation = [
  {
    "kind": "entityList",
    "entity": "Venue",
    "queryKeyHint": "queryKeys.venue.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Venue",
    "queryKeyHint": "queryKeys.venue.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- Venue.updateDetails ---
export interface VenueUpdateDetailsClientInput {
  name: string;
  /** Allowed: "client_site" | "banquet_hall" | "outdoor" | "office" | "private_home" | "other" */
  venueType: "client_site" | "banquet_hall" | "outdoor" | "office" | "private_home" | "other";
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  countryCode?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  accessNotes?: string;
  cateringNotes?: string;
}

export const VenueUpdateDetailsCapability = {
  capabilityId: "Venue.updateDetails",
  entity: "Venue",
  command: "updateDetails",
  route: "/api/manifest/Venue/commands/updateDetails",
  instanceCommand: true,
  clientParameterNames: ["name","venueType","addressLine1","addressLine2","city","region","postalCode","countryCode","contactName","contactEmail","contactPhone","accessNotes","cateringNotes"],
  serverParameterNames: [],
  emits: ["VenueDetailsUpdated"],
} as const;

/**
 * Build command input for Venue.updateDetails.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindVenueUpdateDetailsInput(client: VenueUpdateDetailsClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful Venue.updateDetails. */
export const VenueUpdateDetailsInvalidation = [
  {
    "kind": "entityList",
    "entity": "Venue",
    "queryKeyHint": "queryKeys.venue.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "Venue",
    "queryKeyHint": "queryKeys.venue.detail(id)",
    "label": "entity detail"
  }
] as const;

// --- WasteRecord.record ---
export interface WasteRecordRecordClientInput {
  ingredientId: string;
  locationId: string;
  /** Bounds: 1..∞ */
  quantity: number;
  /** Allowed: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion" */
  unit: "each" | "gram" | "kilogram" | "ounce" | "pound" | "milliliter" | "liter" | "teaspoon" | "tablespoon" | "cup" | "pint" | "quart" | "gallon" | "portion";
  /** Allowed: "spoilage" | "prep_error" | "overproduction" | "other" */
  reason: "spoilage" | "prep_error" | "overproduction" | "other";
  eventId?: string;
  /** Bounds: 0..∞ */
  unitCost?: number;
  notes?: string;
}

export const WasteRecordRecordCapability = {
  capabilityId: "WasteRecord.record",
  entity: "WasteRecord",
  command: "record",
  route: "/api/manifest/WasteRecord/commands/record",
  instanceCommand: true,
  clientParameterNames: ["ingredientId","locationId","quantity","unit","reason","eventId","unitCost","notes"],
  serverParameterNames: [],
  emits: ["WasteRecorded"],
} as const;

/**
 * Build command input for WasteRecord.record.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindWasteRecordRecordInput(client: WasteRecordRecordClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful WasteRecord.record. */
export const WasteRecordRecordInvalidation = [
  {
    "kind": "entityList",
    "entity": "WasteRecord",
    "queryKeyHint": "queryKeys.wasteRecord.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "WasteRecord",
    "queryKeyHint": "queryKeys.wasteRecord.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for WasteRecord.record. */
export const WasteRecordRecordLifecycle = [
  {
    "property": "status",
    "from": "pending",
    "to": "recorded",
    "proven": true
  }
] as const;

// --- WasteRecord.voidRecord ---
export interface WasteRecordVoidRecordClientInput {
  reason: string;
}

export const WasteRecordVoidRecordCapability = {
  capabilityId: "WasteRecord.voidRecord",
  entity: "WasteRecord",
  command: "voidRecord",
  route: "/api/manifest/WasteRecord/commands/voidRecord",
  instanceCommand: true,
  clientParameterNames: ["reason"],
  serverParameterNames: [],
  emits: ["WasteVoided"],
} as const;

/**
 * Build command input for WasteRecord.voidRecord.
 * Client fields only; server-owned fields are injected separately.
 */
export function bindWasteRecordVoidRecordInput(client: WasteRecordVoidRecordClientInput): Record<string, unknown> {
  return { ...client };
}

/** Invalidation targets after a successful WasteRecord.voidRecord. */
export const WasteRecordVoidRecordInvalidation = [
  {
    "kind": "entityList",
    "entity": "WasteRecord",
    "queryKeyHint": "queryKeys.wasteRecord.lists()",
    "label": "entity list"
  },
  {
    "kind": "entityDetail",
    "entity": "WasteRecord",
    "queryKeyHint": "queryKeys.wasteRecord.detail(id)",
    "label": "entity detail"
  }
] as const;

/** Proven lifecycle transitions for WasteRecord.voidRecord. */
export const WasteRecordVoidRecordLifecycle = [
  {
    "property": "status",
    "from": "recorded",
    "to": "voided",
    "proven": true
  }
] as const;

/** All capability ids in this contract (sorted). */
export const ALL_CAPABILITY_IDS = [
  "AvailabilityWindow.declare",
  "AvailabilityWindow.withdraw",
  "Client.archive",
  "Client.assignOwner",
  "Client.changeBillingProfile",
  "Client.changeContact",
  "Client.reactivate",
  "Client.register",
  "ClientContact.add",
  "ClientContact.remove",
  "ClientContact.setPrimary",
  "ClientContact.updateDetails",
  "Contract.draft",
  "Contract.expire",
  "Contract.markViewed",
  "Contract.markVoided",
  "Contract.send",
  "Contract.sign",
  "Delivery.cancel",
  "Delivery.confirmDelivery",
  "Delivery.markFailed",
  "Delivery.schedule",
  "Delivery.startTransit",
  "Dish.introduce",
  "Dish.reinstate",
  "Dish.retire",
  "Dish.reviseDetails",
  "Dish.updatePortioning",
  "DishRecipe.attach",
  "DishRecipe.detach",
  "DishTask.add",
  "DishTask.retire",
  "DishTask.revise",
  "Event.approve",
  "Event.assignOwner",
  "Event.beginExecution",
  "Event.cancel",
  "Event.changeHeadcount",
  "Event.changePricing",
  "Event.changePrimaryContact",
  "Event.changeRequirements",
  "Event.changeVenue",
  "Event.closeOut",
  "Event.complete",
  "Event.planEngagement",
  "Event.reschedule",
  "Event.returnToPlanning",
  "Event.submitForApproval",
  "EventAllergenCheck.record",
  "EventAssignment.assign",
  "EventAssignment.checkIn",
  "EventAssignment.checkOut",
  "EventAssignment.confirm",
  "EventAssignment.markNoShow",
  "EventAssignment.unassign",
  "EventCloseout.capture",
  "EventCloseout.finalize",
  "EventDish.addToEvent",
  "EventDish.adjustServings",
  "EventDish.changeCourse",
  "EventDish.remove",
  "EventDish.updateInstructions",
  "EventGuest.assignTable",
  "EventGuest.checkIn",
  "EventGuest.invite",
  "EventGuest.rsvpConfirm",
  "EventGuest.rsvpDecline",
  "EventGuest.withdraw",
  "Incident.beginInvestigation",
  "Incident.dismiss",
  "Incident.markResolved",
  "Incident.report",
  "Ingredient.classifyAllergens",
  "Ingredient.discontinue",
  "Ingredient.introduce",
  "Ingredient.reinstate",
  "Ingredient.updateCosting",
  "Ingredient.updateDetails",
  "IngredientDemand.calculate",
  "IngredientDemand.confirm",
  "IngredientDemand.fulfill",
  "IngredientDemand.recalculate",
  "IngredientDemand.supersede",
  "InventoryItem.adjustQuantity",
  "InventoryItem.open",
  "InventoryItem.receiveStock",
  "InventoryItem.recount",
  "InventoryItem.remove",
  "InventoryItem.transferIn",
  "InventoryItem.transferOut",
  "InventoryItem.updateLevels",
  "InventoryReservation.consume",
  "InventoryReservation.release",
  "InventoryReservation.reserve",
  "Invoice.applyPayment",
  "Invoice.issue",
  "Invoice.markOverdue",
  "Invoice.markViewed",
  "Invoice.markVoided",
  "Invoice.recordRefund",
  "Invoice.send",
  "Invoice.writeOff",
  "Menu.archive",
  "Menu.draft",
  "Menu.markPublished",
  "Menu.restore",
  "Menu.reviseDetails",
  "Menu.unpublish",
  "Menu.updatePricing",
  "MenuDish.add",
  "MenuDish.remove",
  "MenuDish.updateDetails",
  "Organization.deactivate",
  "Organization.reactivate",
  "Organization.register",
  "Organization.rename",
  "Organization.suspend",
  "PackList.cancel",
  "PackList.dispatch",
  "PackList.markLoaded",
  "PackList.markPacked",
  "PackList.open",
  "PackList.startPacking",
  "PackListItem.addItem",
  "PackListItem.adjustQuantity",
  "PackListItem.markMissing",
  "PackListItem.markPacked",
  "Payment.beginProcessing",
  "Payment.fail",
  "Payment.record",
  "Payment.refund",
  "Payment.settle",
  "PaymentMethod.clearDefault",
  "PaymentMethod.expire",
  "PaymentMethod.invalidate",
  "PaymentMethod.makeDefault",
  "PaymentMethod.reactivate",
  "PaymentMethod.register",
  "PaymentMethod.remove",
  "PayrollInput.finalize",
  "PayrollInput.markVoided",
  "PayrollInput.prepare",
  "Person.assignRole",
  "Person.correctIdentity",
  "Person.deactivate",
  "Person.hire",
  "Person.reactivate",
  "Person.terminate",
  "PrepTask.cancel",
  "PrepTask.claim",
  "PrepTask.complete",
  "PrepTask.markBlocked",
  "PrepTask.open",
  "PrepTask.refreshGenerated",
  "PrepTask.release",
  "PrepTask.revise",
  "PrepTask.start",
  "PrepTask.unblock",
  "ProductionBatch.cancel",
  "ProductionBatch.complete",
  "ProductionBatch.plan",
  "ProductionBatch.start",
  "Proposal.accept",
  "Proposal.decline",
  "Proposal.draft",
  "Proposal.expire",
  "Proposal.markViewed",
  "Proposal.send",
  "PurchaseNeed.assignToDraft",
  "PurchaseNeed.cancel",
  "PurchaseNeed.create",
  "PurchaseNeed.markDraftOrdered",
  "PurchaseNeed.markFulfilled",
  "PurchaseNeed.markOrdered",
  "Qualification.expire",
  "Qualification.grant",
  "Qualification.revoke",
  "QualityCheck.fail",
  "QualityCheck.open",
  "QualityCheck.pass",
  "QualityCheck.reinspect",
  "Recipe.draft",
  "Recipe.publishVersion",
  "Recipe.retire",
  "Recipe.retract",
  "Recipe.reviseDraft",
  "RecipeImport.approveReview",
  "RecipeImport.beginFinalization",
  "RecipeImport.beginReview",
  "RecipeImport.cancel",
  "RecipeImport.complete",
  "RecipeImport.markFailed",
  "RecipeImport.recordParse",
  "RecipeImport.recordRecipe",
  "RecipeImport.recordResolutionProgress",
  "RecipeImport.resumeReview",
  "RecipeImport.upload",
  "RecipeImportLine.attachCreatedIngredient",
  "RecipeImportLine.confirmExisting",
  "RecipeImportLine.confirmNew",
  "RecipeImportLine.discard",
  "RecipeImportLine.markNew",
  "RecipeImportLine.resetResolution",
  "RecipeImportLine.stage",
  "RecipeImportLine.suggestExactMatch",
  "RecipeImportLine.suggestPossibleMatches",
  "RecipeIngredient.add",
  "RecipeIngredient.adjustQuantity",
  "RecipeIngredient.remove",
  "RecipeStep.add",
  "RecipeStep.remove",
  "RecipeStep.revise",
  "SavedReportDefinition.archive",
  "SavedReportDefinition.changeSharing",
  "SavedReportDefinition.createDefinition",
  "SavedReportDefinition.rename",
  "SavedReportDefinition.restore",
  "SavedReportDefinition.updateDefinition",
  "Shift.cancel",
  "Shift.complete",
  "Shift.markNoShow",
  "Shift.schedule",
  "Shift.start",
  "StorageLocation.activate",
  "StorageLocation.deactivate",
  "StorageLocation.register",
  "StorageLocation.reviseDetails",
  "TimeRecord.clockIn",
  "TimeRecord.clockOut",
  "TimeRecord.correct",
  "Vendor.onboard",
  "Vendor.reinstate",
  "Vendor.suspend",
  "Vendor.terminate",
  "Vendor.updateDetails",
  "VendorOrder.cancel",
  "VendorOrder.confirm",
  "VendorOrder.markPartiallyReceived",
  "VendorOrder.markReceived",
  "VendorOrder.open",
  "VendorOrder.submit",
  "VendorOrder.updateTotals",
  "VendorOrderLine.addLine",
  "VendorOrderLine.cancelLine",
  "VendorOrderLine.recordReceipt",
  "VendorOrderLine.reviseQuantity",
  "VendorOrderLineDemand.link",
  "VendorOrderLineDemand.retire",
  "VendorOrderLineDemand.revise",
  "Venue.activate",
  "Venue.changeCapacity",
  "Venue.deactivate",
  "Venue.register",
  "Venue.updateDetails",
  "WasteRecord.record",
  "WasteRecord.voidRecord"
] as const;
