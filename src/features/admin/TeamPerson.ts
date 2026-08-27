export type TeamPerson = {
  _id: string;
  givenName: string;
  familyName: string;
  email: string;
  role: string;
  status: string;
  authSubjectId?: string | null;
  employeeNumber?: string | null;
  deletedAt?: unknown;
  version?: number;
};
