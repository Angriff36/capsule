/**
 * HTTP command routes are served on the Convex site origin.
 * The function API origin does not host them.
 */
export class ConvexSiteOrigin {
  static from(url: string): string {
    return url
      .replace(".convex.cloud", ".convex.site")
      .replace(/:3210$/, ":3211")
      .replace(/\/$/, "");
  }
}
