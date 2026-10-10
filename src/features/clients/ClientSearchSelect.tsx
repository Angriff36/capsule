import { useMemo, useState } from "react";
import {
  useClientSearch,
  useClientsByIds,
  type DirectoryClient,
} from "../../lib/useClientDirectory";
import { SearchSelect, type SearchSelectOption } from "../../ui/SearchSelect";
import { clientDisplayName } from "../events/clientName";

type Props = {
  value?: string;
  defaultValue?: string;
  /** The picked id, and its row when the picker has it (names, type). */
  onChange?: (id: string, row?: DirectoryClient) => void;
  name?: string;
  form?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  "aria-label"?: string;
  /** Archived clients are left out unless already picked. */
  includeArchived?: boolean;
  /** Options the server does not know yet (a client just made inline). */
  extraOptions?: readonly SearchSelectOption[];
  emptyText?: string;
  onCreate?: (query: string) => void;
  createLabel?: (query: string) => string;
  testId?: string;
};

/**
 * Pick a client by typing part of a name. The server searches (at most 25
 * matches); the page never loads every client.
 */
export function ClientSearchSelect({
  value,
  defaultValue,
  onChange,
  includeArchived = false,
  placeholder = "Type a client name…",
  extraOptions = [],
  emptyText,
  ...rest
}: Props) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState(value ?? defaultValue ?? "");
  const current = value ?? picked;
  const found = useClientSearch(text);
  const chosen = useClientsByIds(current ? [current] : []);
  const rows = useMemo(
    () =>
      new Map(
        [...(chosen ?? []), ...(found ?? [])].map((row) => [
          String(row._id),
          row,
        ]),
      ),
    [chosen, found],
  );
  const options = useMemo(() => {
    const out: SearchSelectOption[] = [];
    for (const row of rows.values()) {
      if (row.isArchived && !includeArchived && row._id !== current) continue;
      out.push({
        id: String(row._id),
        label: clientDisplayName(row._id, [row]),
        // Two clients can share a name: show the person's company, else
        // the client type, so they can be told apart.
        hint:
          [
            row.clientType === "person"
              ? row.companyName?.trim() || "Person"
              : "Company",
            row.isArchived ? "Archived" : null,
          ]
            .filter(Boolean)
            .join(" · ") || null,
      });
    }
    for (const extra of extraOptions) if (!rows.has(extra.id)) out.push(extra);
    return out;
  }, [rows, includeArchived, current, extraOptions]);
  return (
    <SearchSelect
      {...rest}
      options={options}
      value={value}
      defaultValue={defaultValue}
      onChange={(id) => {
        setPicked(id);
        onChange?.(id, rows.get(id));
      }}
      onQueryChange={setText}
      placeholder={placeholder}
      emptyText={
        found === undefined
          ? "Searching…"
          : (emptyText ?? "No client by that name.")
      }
    />
  );
}
