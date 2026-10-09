import { useMemo, useState } from "react";
import { useDishSearch, useDishesByIds } from "../../lib/useDishesByIds";
import { SearchSelect, type SearchSelectOption } from "../../ui/SearchSelect";

type Props = {
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  name?: string;
  form?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  "aria-label"?: string;
};

/**
 * Pick a dish by typing part of its name. The server searches (at most 40
 * matches); the page never loads the whole dish catalog.
 */
export function DishSearchSelect({
  value,
  defaultValue,
  onChange,
  placeholder = "Type a dish name…",
  ...rest
}: Props) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState(value ?? defaultValue ?? "");
  const current = value ?? picked;
  const found = useDishSearch(text);
  const chosen = useDishesByIds(current ? [current] : []);
  const options = useMemo(() => {
    const rows = new Map(
      [...(chosen ?? []), ...(found ?? [])].map((row) => [
        String(row._id),
        row,
      ]),
    );
    const out: SearchSelectOption[] = [];
    for (const row of rows.values())
      if (row.isActive || row._id === current)
        out.push({
          id: String(row._id),
          label: row.name,
          hint: row.isActive ? null : "Retired",
        });
    return out;
  }, [chosen, found, current]);
  return (
    <SearchSelect
      {...rest}
      options={options}
      value={value}
      defaultValue={defaultValue}
      onChange={(id) => {
        setPicked(id);
        onChange?.(id);
      }}
      onQueryChange={setText}
      placeholder={placeholder}
      emptyText={found === undefined ? "Searching…" : "No dish by that name."}
    />
  );
}
