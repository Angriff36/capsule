export const CLIENTS_PIPELINE_SECTION = {
  key: "pipeline",
  label: "Pipeline",
  path: "/clients/pipeline",
} as const;

export const CLIENTS_SECTIONS = [
  { key: "accounts", label: "Accounts", path: "/clients" },
  { key: "contracts", label: "Contracts", path: "/clients/contracts" },
  { key: "inbox", label: "Inbox", path: "/clients/inbox" },
] as const;

export type ClientsSection = (typeof CLIENTS_SECTIONS)[number]["key"];

export const CLIENTS_ROUTES = {
  root: "/clients",
  pipeline: "/clients/pipeline",
  detail: (id: string) => `/clients/${id}`,
  proposals: "/clients/proposals",
  // Deep link into the proposals page's focused row: ?proposal=<id> opens
  // that proposal's detail panels and scrolls the row into view.
  proposal: (id: string) => `/clients/proposals?proposal=${id}`,
  proposalTemplates: "/events/setup#proposal-templates",
  tastings: "/clients/pipeline#tastings",
  contracts: "/clients/contracts",
  retention: "/clients#retention",
  quoteRequests: "/clients/pipeline#quote-requests",
  inbox: "/clients/inbox",
  dateHolds: "/clients/pipeline#date-holds",
  contractDocument: (id: string) => `/clients/contracts/${id}/document`,
} as const;
