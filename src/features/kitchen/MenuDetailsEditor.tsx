import { useState, type FormEvent } from "react";
import {
  useMenuReviseDetails,
  useMenuSetSeason,
  useMenuSetService,
  useMenuUpdatePricing,
} from "../../lib/manifest-convex-react";
import { BoundedDateInput } from "../../ui/BoundedDateInputs";

type SaveKey = "details" | "pricing" | "season" | "service";

// Season dates are whole days: the start counts from the start of its day,
// the end until the end of its day (browser time).
const dayStart = (day: string) =>
  day ? new Date(`${day}T00:00:00`).getTime() : undefined;
const dayEnd = (day: string) =>
  day ? new Date(`${day}T23:59:59.999`).getTime() : undefined;
const toDay = (ms: number | null | undefined) => {
  if (ms == null) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// One "Edit menu" section. Details and pricing are two separate commands with
// different guards, so each keeps its own Save button. Every field of a command
// is sent on save, because an omitted optional param clears the stored value.

export type MenuDetailsTarget = {
  _id: string;
  version: number;
  name: string;
  description?: string | null;
  category?: string | null;
  isTemplate: boolean;
  basePrice: number;
  pricePerPerson: number;
  minGuests: number;
  maxGuests: number;
  status: string;
  availableFrom?: number | null;
  availableUntil?: number | null;
  guestsPerServer?: number | null;
  pickOneCourses?: string[] | null;
};

export function MenuDetailsEditor({
  menu,
  courses = [],
  onFailure,
}: Readonly<{
  menu: MenuDetailsTarget;
  /** The course names on this menu's dishes, in menu order. */
  courses?: string[];
  onFailure: (error: unknown) => void;
}>) {
  const reviseDetails = useMenuReviseDetails();
  const updatePricing = useMenuUpdatePricing();
  const setSeason = useMenuSetSeason();
  const setService = useMenuSetService();
  const [guestsPerServer, setGuestsPerServer] = useState(
    menu.guestsPerServer == null ? "" : String(menu.guestsPerServer),
  );
  const [pickOne, setPickOne] = useState<string[]>(menu.pickOneCourses ?? []);
  const isPickOne = (course: string) =>
    pickOne.some((c) => c.toLowerCase() === course.toLowerCase());
  // A saved pick-one course whose dishes were all moved stays listed so it
  // can be cleared.
  const serviceCourses = [
    ...courses,
    ...(menu.pickOneCourses ?? []).filter(
      (c) => !courses.some((k) => k.toLowerCase() === c.toLowerCase()),
    ),
  ];
  const [seasonFrom, setSeasonFrom] = useState(toDay(menu.availableFrom));
  const [seasonUntil, setSeasonUntil] = useState(toDay(menu.availableUntil));

  const [name, setName] = useState(menu.name);
  const [description, setDescription] = useState(menu.description ?? "");
  const [category, setCategory] = useState(menu.category ?? "");
  const [isTemplate, setIsTemplate] = useState(Boolean(menu.isTemplate));
  const [basePrice, setBasePrice] = useState(String(menu.basePrice));
  const [pricePerPerson, setPricePerPerson] = useState(
    String(menu.pricePerPerson),
  );
  const [minGuests, setMinGuests] = useState(String(menu.minGuests));
  const [maxGuests, setMaxGuests] = useState(String(menu.maxGuests));
  const [saving, setSaving] = useState<SaveKey | null>(null);

  // reviseDetails guards `status == "draft"`; updatePricing allows draft and
  // published. Archived menus are read-only until they are restored.
  const canEditDetails = menu.status === "draft";
  const canEditPricing = menu.status === "draft" || menu.status === "published";
  const detailsTitle = canEditDetails
    ? undefined
    : "Only a draft menu's details can be changed";
  const pricingTitle = canEditPricing
    ? undefined
    : "Restore this menu before changing its pricing";

  const args = { docId: menu._id, version: menu.version };

  const run = async (key: SaveKey, work: () => Promise<void>) => {
    setSaving(key);
    onFailure(null);
    try {
      await work();
    } catch (error) {
      onFailure(error);
    } finally {
      setSaving(null);
    }
  };

  const onSaveDetails = (event: FormEvent) => {
    event.preventDefault();
    if (!canEditDetails) return;
    void run("details", async () => {
      await reviseDetails({
        ...args,
        name: name.trim(),
        description: description.trim() || undefined,
        category: category.trim() || undefined,
        isTemplate,
      });
    });
  };

  const onSavePricing = (event: FormEvent) => {
    event.preventDefault();
    if (!canEditPricing) return;
    const base = Number(basePrice);
    const perPerson = Number(pricePerPerson);
    const min = Math.trunc(Number(minGuests) || 0);
    const max = Math.trunc(Number(maxGuests) || 0);
    if (!Number.isFinite(base) || !Number.isFinite(perPerson)) return;
    void run("pricing", async () => {
      await updatePricing({
        ...args,
        basePrice: base,
        pricePerPerson: perPerson,
        minGuests: min,
        maxGuests: max,
      });
    });
  };

  const onSaveSeason = (event: FormEvent) => {
    event.preventDefault();
    if (!canEditPricing) return;
    void run("season", async () => {
      // Both dates are always sent: an empty one clears that end.
      await setSeason({
        ...args,
        availableFrom: dayStart(seasonFrom),
        availableUntil: dayEnd(seasonUntil),
      });
    });
  };

  const onSaveService = (event: FormEvent) => {
    event.preventDefault();
    if (!canEditPricing) return;
    const ratio = Math.trunc(Number(guestsPerServer));
    void run("service", async () => {
      // Both fields are always sent: an empty ratio clears it.
      await setService({
        ...args,
        guestsPerServer:
          guestsPerServer.trim() && ratio >= 1 ? ratio : undefined,
        pickOneCourses: pickOne,
      });
    });
  };

  return (
    <section className="culinary-section" aria-labelledby="menu-edit-heading">
      <div className="culinary-section-heading">
        <div>
          <p className="eyebrow">This menu</p>
          <h2 id="menu-edit-heading">Edit menu</h2>
        </div>
        {canEditDetails ? null : <span>Details edit in draft only</span>}
      </div>

      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={onSaveDetails}>
        <label className="field-label sm:col-span-2">
          <span>Name</span>
          <input
            className="input"
            value={name}
            disabled={!canEditDetails || saving != null}
            title={detailsTitle}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        <label className="field-label sm:col-span-2">
          <span>Description</span>
          <textarea
            className="input"
            rows={2}
            value={description}
            disabled={!canEditDetails || saving != null}
            title={detailsTitle}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <label className="field-label">
          <span>Category</span>
          <input
            className="input"
            value={category}
            disabled={!canEditDetails || saving != null}
            title={detailsTitle}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Wedding, corporate, drop-off…"
          />
        </label>
        <label className="flex items-center gap-2 self-end text-base">
          <input
            type="checkbox"
            checked={isTemplate}
            disabled={!canEditDetails || saving != null}
            title={detailsTitle}
            onChange={(event) => setIsTemplate(event.target.checked)}
          />
          <span>Reusable template</span>
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!canEditDetails || saving != null}
            title={detailsTitle}
          >
            {saving === "details" ? "Saving…" : "Save details"}
          </button>
        </div>
      </form>

      <form className="mt-6 grid gap-3 sm:grid-cols-2" onSubmit={onSavePricing}>
        <div className="culinary-section-heading sm:col-span-2">
          <h3 className="text-lg font-semibold text-ink">Pricing</h3>
          <span>Max guests of 0 means unlimited</span>
        </div>
        <label className="field-label">
          <span>Base price</span>
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            value={basePrice}
            disabled={!canEditPricing || saving != null}
            title={pricingTitle}
            onChange={(event) => setBasePrice(event.target.value)}
            required
          />
        </label>
        <label className="field-label">
          <span>Price per person</span>
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            value={pricePerPerson}
            disabled={!canEditPricing || saving != null}
            title={pricingTitle}
            onChange={(event) => setPricePerPerson(event.target.value)}
            required
          />
        </label>
        <label className="field-label">
          <span>Minimum guests</span>
          <input
            className="input"
            type="number"
            min={0}
            step="1"
            value={minGuests}
            disabled={!canEditPricing || saving != null}
            title={pricingTitle}
            onChange={(event) => setMinGuests(event.target.value)}
          />
        </label>
        <label className="field-label">
          <span>Maximum guests</span>
          <input
            className="input"
            type="number"
            min={0}
            step="1"
            value={maxGuests}
            disabled={!canEditPricing || saving != null}
            title={pricingTitle}
            onChange={(event) => setMaxGuests(event.target.value)}
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!canEditPricing || saving != null}
            title={pricingTitle}
          >
            {saving === "pricing" ? "Saving…" : "Save pricing"}
          </button>
        </div>
      </form>

      <form className="mt-6 grid gap-3 sm:grid-cols-2" onSubmit={onSaveSeason}>
        <div className="culinary-section-heading sm:col-span-2">
          <h3 className="text-lg font-semibold text-ink">Season</h3>
          <span>Leave both empty to offer this menu all year</span>
        </div>
        <label className="field-label">
          <span>Offered from</span>
          <BoundedDateInput
            className="input"
            value={seasonFrom}
            disabled={!canEditPricing || saving != null}
            title={pricingTitle}
            onChange={(event) => setSeasonFrom(event.target.value)}
          />
        </label>
        <label className="field-label">
          <span>Offered until</span>
          <BoundedDateInput
            className="input"
            value={seasonUntil}
            min={seasonFrom || undefined}
            disabled={!canEditPricing || saving != null}
            title={pricingTitle}
            onChange={(event) => setSeasonUntil(event.target.value)}
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!canEditPricing || saving != null}
            title={pricingTitle}
          >
            {saving === "season" ? "Saving…" : "Save season"}
          </button>
        </div>
      </form>

      <form className="mt-6 grid gap-3 sm:grid-cols-2" onSubmit={onSaveService}>
        <div className="culinary-section-heading sm:col-span-2">
          <h3 className="text-lg font-semibold text-ink">Service</h3>
          <span>Shown to clients on the menu</span>
        </div>
        <label className="field-label">
          <span>Guests per server</span>
          <input
            className="input"
            type="number"
            min={1}
            step="1"
            value={guestsPerServer}
            disabled={!canEditPricing || saving != null}
            title={pricingTitle}
            onChange={(event) => setGuestsPerServer(event.target.value)}
            placeholder="Empty = not shown"
          />
        </label>
        <fieldset className="field-label sm:col-span-2">
          <legend>Guests pick one dish from</legend>
          {serviceCourses.length === 0 ? (
            <p className="text-ink-3">
              Give this menu's dishes a course first.
            </p>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {serviceCourses.map((course) => (
                <label
                  key={course}
                  className="flex items-center gap-2 text-base"
                >
                  <input
                    type="checkbox"
                    checked={isPickOne(course)}
                    disabled={!canEditPricing || saving != null}
                    title={pricingTitle}
                    onChange={(event) =>
                      setPickOne((current) =>
                        event.target.checked
                          ? [...current, course]
                          : current.filter(
                              (c) => c.toLowerCase() !== course.toLowerCase(),
                            ),
                      )
                    }
                  />
                  <span>{course}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!canEditPricing || saving != null}
            title={pricingTitle}
          >
            {saving === "service" ? "Saving…" : "Save service"}
          </button>
        </div>
      </form>
    </section>
  );
}
