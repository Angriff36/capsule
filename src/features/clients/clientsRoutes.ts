export const CLIENTS_PIPELINE_SECTION = {
  key: "pipeline",
  label: "Pipeline",
  path: "/clients/pipeline",
} as const;

export const CLIENTS_SECTIONS = [
  { key: "accounts", label: "Accounts", path: "/clients" },
  { key: "proposals", label: "Proposals", path: "/clients/proposals" },
  {
    key: "proposalTemplates",
    label: "Proposal Templates",
    path: "/clients/proposals/templates",
  },
  { key: "contracts", label: "Contracts", path: "/clients/contracts" },
  { key: "retention", label: "Retention", path: "/clients/retention" },
  {
    key: "quoteRequests",
    label: "Quote Requests",
    path: "/clients/quote-requests",
  },
  { key: "inbox", label: "Inbox", path: "/clients/inbox" },
] as const;

export type ClientsSection = (typeof CLIENTS_SECTIONS)[number]["key"];

export const CLIENTS_ROUTES = {
  root: "/clients",
  pipeline: "/clients/pipeline",
  detail: (id: string) => `/clients/${id}`,
  proposals: "/clients/proposals",
  proposalTemplates: "/clients/proposals/templates",
  contracts: "/clients/contracts",
  retention: "/clients/retention",
  quoteRequests: "/clients/quote-requests",
  inbox: "/clients/inbox",
  contractDocument: (id: string) => `/clients/contracts/${id}/document`,
} as const;
