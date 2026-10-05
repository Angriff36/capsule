export type ListField<T> = {
  key: string;
  defaultValue: T;
  parse: (value: string | null) => T;
  serialize: (value: T) => string | null;
};

export type ListSchema<T extends Record<string, unknown>> = {
  [K in keyof T]: ListField<T[K]>;
};

/** Owns one list's URL-control contract and leaves unrelated query keys alone. */
export class ListStateManager<T extends Record<string, unknown>> {
  constructor(readonly schema: ListSchema<T>) {}

  read(search: URLSearchParams): T {
    return Object.fromEntries(
      Object.entries(this.schema).map(([name, field]) => [
        name,
        (field as ListField<unknown>).parse(search.get(field.key)),
      ]),
    ) as T;
  }

  hasExplicitState(search: URLSearchParams) {
    return Object.values(this.schema).some((field) => search.has(field.key));
  }

  patch(current: URLSearchParams, patch: Partial<T>) {
    const next = new URLSearchParams(current);
    for (const [name, value] of Object.entries(patch)) {
      const field = this.schema[name as keyof T] as ListField<unknown>;
      const serialized = field.serialize(value);
      if (serialized == null || value === field.defaultValue)
        next.delete(field.key);
      else next.set(field.key, serialized);
    }
    return next;
  }
}
