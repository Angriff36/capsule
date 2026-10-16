import { StudioCopyManager } from "./StudioCopyManager";
import { StudioLayoutManager } from "./StudioLayoutManager";

const noop = async (): Promise<void> => {};

/** Managers that do not talk to Convex, used when list queries are down. */
export class StudioEmptyManagers {
  static copy(): StudioCopyManager {
    return new StudioCopyManager([], noop, noop, noop);
  }

  static layout(): StudioLayoutManager {
    return new StudioLayoutManager([], noop, noop, noop);
  }
}
