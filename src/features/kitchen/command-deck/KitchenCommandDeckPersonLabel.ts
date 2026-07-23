import type { PersonLike } from "./KitchenCommandDeckTypes";

export class KitchenCommandDeckPersonLabel {
  static full(person: PersonLike | undefined | null): string {
    if (!person) return "Unassigned";
    const name = [person.givenName, person.familyName]
      .filter(Boolean)
      .join(" ");
    return name || person._id.slice(0, 8);
  }

  static first(person: PersonLike | undefined | null): string {
    if (!person) return "?";
    return (person.givenName || this.full(person).split(" ")[0] || "?").trim();
  }

  static initials(person: PersonLike | undefined | null): string {
    if (!person) return "?";
    const g = (person.givenName ?? "").trim();
    const f = (person.familyName ?? "").trim();
    if (g && f) return `${g[0]}${f[0]}`.toUpperCase();
    const full = this.full(person);
    return full.slice(0, 2).toUpperCase();
  }
}
