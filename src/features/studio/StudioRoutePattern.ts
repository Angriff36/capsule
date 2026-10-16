/**
 * Turns a live path into a screen shape so a label change on one event
 * page can apply to every event page, while `/events` stays `/events`.
 */
export class StudioRoutePattern {
  static fromPath(pathname: string): string {
    const trimmed = pathname.replace(/\/+$/, "") || "/";
    return trimmed.replace(/\/[A-Za-z0-9_-]{16,}(?=\/|$)/g, "/:id");
  }
}
