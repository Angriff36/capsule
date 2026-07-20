export const CLIENTS_SECTIONS = [
  { key: "accounts", label: "Accounts", path: "/clients" },
  { key: "proposals", label: "Proposals", path: "/clients/proposals" },
  { key: "contracts", label: "Contracts", path: "/clients/contracts" },
] as const;

export type ClientsSection = (typeof CLIENTS_SECTIONS)[number]["key"];

export const CLIENTS_ROUTES = {
  root: "/clients",
  detail: (id: string) => `/clients/${id}`,
  proposals: "/clients/proposals",
  contracts: "/clients/contracts",
} as const;
