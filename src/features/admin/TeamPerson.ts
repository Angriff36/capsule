export type TeamPerson = {
  _id: string;
  givenName: string;
  familyName: string;
  email: string;
  role: string;
  status: string;
  authSubjectId?: string | null;
  employeeNumber?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  deletedAt?: unknown;
  version?: number;
};
