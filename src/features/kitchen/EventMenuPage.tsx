import { useState, type FormEvent } from "react";
import {
  useCreateEventDish,
  useEventDishAdjustServings,
  useEventDishRemove,
  useListDish,
  useListEvent,
  useListEventDish,
} from "../../lib/manifest-convex-react";
import { TableSkeleton } from "../../ui/primitives";
import { CulinaryFailureBanner } from "./CulinaryFailureBanner";
import { KitchenBookNav } from "./KitchenBookNav";

export function EventMenuPage() {
  const events = useListEvent();
  const dishes = useListDish();
  const eventDishes = useListEventDish();
  const createEventDish = useCreateEventDish();
  const adjustServings = useEventDishAdjustServings();
  const removeDish = useEventDishRemove();
  const [eventId, setEventId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const selectedEvent = events?.find((event) => event._id === eventId);
  const selections = (eventDishes ?? []).filter(
    (item) => item.deletedAt == null && item.eventId === eventId,
  );
  const dishName = (dishId: string) =>
    dishes?.find((dish) => dish._id === dishId)?.name ?? "Unknown dish";
  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run("select", async () => {
      await createEventDish({
        eventId,
        dishId: String(data.get("dishId")),
        quantityServings: Number(data.get("quantityServings")),
        course: String(data.get("course") ?? "").trim() || undefined,
        serviceStyle:
          String(data.get("serviceStyle") ?? "").trim() || undefined,
        specialInstructions:
          String(data.get("specialInstructions") ?? "").trim() || undefined,
      });
      form.reset();
    });
  };

  return (
    <div className="recipe-book-stage">
      <header className="recipe-book-masthead">
        <div>
          <p className="eyebrow">Culinary book · Cross-system handoff</p>
          <h1 className="display-title mt-2">Event menu</h1>
          <p className="mt-3 max-w-150 text-ink-2">
            Select service dishes for a real event. The generated EventDish
            command decides whether the event stage permits the change.
          </p>
        </div>
      </header>
      <KitchenBookNav />
      {failure ? (
        <div className="mt-4">
          <CulinaryFailureBanner error={failure} />
        </div>
      ) : null}
      <div className="event-menu-layout">
        <section>
          <div className="culinary-section-heading">
            <h2>Engagement</h2>
          </div>
          <label className="field-label mt-5">
            Event
            <select
              className="input"
              value={eventId}
              onChange={(event) => setEventId(event.target.value)}
            >
              <option value="">Select event</option>
              {(events ?? [])
                .filter((event) => event.deletedAt == null)
                .map((event) => (
                  <option key={event._id} value={event._id}>
                    {event.title} · {event.stage}
                  </option>
                ))}
            </select>
          </label>
          {selectedEvent ? (
            <dl className="event-menu-brief">
              <div>
                <dt>Stage</dt>
                <dd>{selectedEvent.stage}</dd>
              </div>
              <div>
                <dt>Headcount</dt>
                <dd>{selectedEvent.expectedHeadcount}</dd>
              </div>
              <div>
                <dt>Venue</dt>
                <dd>{selectedEvent.venueName || "—"}</dd>
              </div>
            </dl>
          ) : null}
          <form onSubmit={submit} className="culinary-create-form mt-6">
            <div className="culinary-create-heading">
              <div>
                <p className="eyebrow">Dish selection</p>
                <h2 className="font-display text-2xl">Add to event</h2>
              </div>
              <button
                className="btn btn-primary"
                disabled={!eventId || busy != null}
              >
                {busy === "select" ? "Selecting…" : "Select dish"}
              </button>
            </div>
            <div className="culinary-create-grid">
              <label className="field-label sm:col-span-2">
                Dish
                <select name="dishId" className="input" required>
                  <option value="">Select dish</option>
                  {(dishes ?? [])
                    .filter(
                      (dish) =>
                        dish.deletedAt == null && dish.status === "active",
                    )
                    .map((dish) => (
                      <option key={dish._id} value={dish._id}>
                        {dish.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field-label">
                Servings
                <input
                  name="quantityServings"
                  type="number"
                  min={1}
                  defaultValue={selectedEvent?.expectedHeadcount || 1}
                  className="input"
                  required
                />
              </label>
              <label className="field-label">
                Course
                <input name="course" className="input" />
              </label>
              <label className="field-label">
                Service style
                <input name="serviceStyle" className="input" />
              </label>
              <label className="field-label sm:col-span-2">
                Special instructions
                <textarea
                  name="specialInstructions"
                  className="input min-h-20 py-2"
                />
              </label>
            </div>
          </form>
        </section>
        <section>
          <div className="culinary-section-heading">
            <h2>Selected dishes</h2>
            <span>{selections.length}</span>
          </div>
          {eventDishes === undefined ? (
            <div className="card mt-5">
              <TableSkeleton rows={5} />
            </div>
          ) : !eventId ? (
            <div className="document-empty">
              <p>Choose an event.</p>
              <span>Its selected dishes will appear here.</span>
            </div>
          ) : selections.length === 0 ? (
            <div className="document-empty">
              <p>No dishes selected.</p>
              <span>
                Add the first service dish through the generated selection
                command.
              </span>
            </div>
          ) : (
            <ul className="event-dish-list">
              {selections.map((selection) => (
                <li key={selection._id}>
                  <div>
                    <strong>{dishName(selection.dishId)}</strong>
                    <span>
                      {selection.course || "Unassigned course"} ·{" "}
                      {selection.serviceStyle || "No service style"}
                    </span>
                  </div>
                  <p>{selection.quantityServings} servings</p>
                  <div className="flex gap-1">
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={busy != null}
                      onClick={() => {
                        const quantity = Number(
                          window.prompt(
                            "Servings",
                            String(selection.quantityServings),
                          ),
                        );
                        if (!Number.isFinite(quantity) || quantity <= 0) return;
                        void run(`adjust:${selection._id}`, async () => {
                          await adjustServings({
                            docId: selection._id,
                            quantityServings: quantity,
                            version: selection.version,
                          });
                        });
                      }}
                    >
                      Adjust
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={busy != null}
                      onClick={() => {
                        const reason = window.prompt("Removal reason")?.trim();
                        if (!reason) return;
                        void run(`remove:${selection._id}`, async () => {
                          await removeDish({
                            docId: selection._id,
                            reason,
                            version: selection.version,
                          });
                        });
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
