import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import "./StockReceiptScanner.css";
import { formatStatusLabel } from "../../lib/statusLabels";

export interface StockReceiptInventoryItem {
  _id: string;
  version: number;
  ingredientId: string;
  locationId: string;
  unit: string;
  unitCost: number;
  quantityOnHand: number;
  deletedAt?: number | null;
}

export interface StockReceiptDemand {
  _id: string;
  ingredientId: string;
  eventId: string;
  requiredQuantity: number;
  unit: string;
  status: string;
  deletedAt?: number | null;
}

interface NamedRecord {
  _id: string;
  name?: string;
  title?: string;
}

export interface StockReceiptSubmission {
  item: StockReceiptInventoryItem;
  demand?: StockReceiptDemand;
  quantity: number;
  unitCost?: number;
}

type ScanReference =
  | { kind: "inventory"; id: string }
  | { kind: "demand"; id: string }
  | { kind: "unknown"; id: string };

export type StockReceiptScanResolution =
  | { status: "found"; reference: `inventory:${string}` | `demand:${string}` }
  | { status: "ambiguous" }
  | { status: "not-found" };

interface BarcodeDetectorResult {
  rawValue: string;
}

interface BarcodeDetectorInstance {
  detect(source: HTMLVideoElement): Promise<BarcodeDetectorResult[]>;
}

interface BarcodeDetectorConstructor {
  new (): BarcodeDetectorInstance;
}

// Full class names are spelled out (never assembled by interpolation) so the
// undefined-class checker can match every variant against StockReceiptScanner.css.
const FEEDBACK_TONE_CLASS = {
  ok: "is-ok",
  warn: "is-warn",
  danger: "is-danger",
} as const;

const idFromUnknown = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export function parseStockReceiptScan(rawValue: string): ScanReference {
  const raw = rawValue.trim();
  if (!raw) return { kind: "unknown", id: "" };

  try {
    const decoded = JSON.parse(raw) as Record<string, unknown>;
    const inventoryItemId = idFromUnknown(decoded.inventoryItemId);
    if (inventoryItemId) return { kind: "inventory", id: inventoryItemId };
    const ingredientDemandId = idFromUnknown(decoded.ingredientDemandId);
    if (ingredientDemandId) return { kind: "demand", id: ingredientDemandId };
  } catch {
    // Scanner payloads are usually plain text; JSON is only one supported form.
  }

  try {
    const url = new URL(raw);
    const inventoryItemId = idFromUnknown(
      url.searchParams.get("inventoryItemId") ??
        url.searchParams.get("inventory_item_id"),
    );
    if (inventoryItemId) return { kind: "inventory", id: inventoryItemId };
    const ingredientDemandId = idFromUnknown(
      url.searchParams.get("ingredientDemandId") ??
        url.searchParams.get("ingredient_demand_id"),
    );
    if (ingredientDemandId) return { kind: "demand", id: ingredientDemandId };
  } catch {
    // A non-URL value can still be a prefixed or raw Capsule record id.
  }

  const typed = raw.match(
    /^(inventory(?:-?item)?|stock|demand|ingredient-?demand)\s*[:#|/]\s*(.+)$/i,
  );
  if (typed) {
    const kind = /demand/i.test(typed[1]) ? "demand" : "inventory";
    return { kind, id: typed[2].trim() };
  }

  return { kind: "unknown", id: raw };
}

export function resolveStockReceiptScan(
  rawValue: string,
  items: readonly StockReceiptInventoryItem[],
  demands: readonly StockReceiptDemand[],
): StockReceiptScanResolution {
  const parsed = parseStockReceiptScan(rawValue);
  if (!parsed.id) return { status: "not-found" };

  const matchingItems = items.filter(
    (item) =>
      item.deletedAt == null &&
      (item._id === parsed.id ||
        (parsed.kind === "unknown" && item.ingredientId === parsed.id)),
  );
  const matchingDemands = demands.filter(
    (demand) =>
      demand.deletedAt == null &&
      (demand._id === parsed.id ||
        (parsed.kind === "unknown" && demand.ingredientId === parsed.id)),
  );

  if (parsed.kind === "inventory") {
    return matchingItems.length === 1
      ? { status: "found", reference: `inventory:${matchingItems[0]._id}` }
      : { status: matchingItems.length > 1 ? "ambiguous" : "not-found" };
  }
  if (parsed.kind === "demand") {
    return matchingDemands.length === 1
      ? { status: "found", reference: `demand:${matchingDemands[0]._id}` }
      : { status: matchingDemands.length > 1 ? "ambiguous" : "not-found" };
  }

  if (matchingItems.length + matchingDemands.length !== 1) {
    return {
      status:
        matchingItems.length + matchingDemands.length > 1
          ? "ambiguous"
          : "not-found",
    };
  }
  return matchingItems.length === 1
    ? { status: "found", reference: `inventory:${matchingItems[0]._id}` }
    : { status: "found", reference: `demand:${matchingDemands[0]._id}` };
}

function BarcodeMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M4 7v18M8 7v18M12 7v18M18 7v18M21 7v18M27 7v18" />
      <path d="M2 4h5M2 4v5M30 4h-5M30 4v5M2 28h5M2 28v-5M30 28h-5M30 28v-5" />
    </svg>
  );
}

export function StockReceiptScanner({
  items,
  demands,
  ingredients,
  locations,
  events,
  onReceive,
}: {
  items: readonly StockReceiptInventoryItem[];
  demands: readonly StockReceiptDemand[];
  ingredients: readonly NamedRecord[];
  locations: readonly NamedRecord[];
  events: readonly NamedRecord[];
  onReceive: (submission: StockReceiptSubmission) => Promise<void>;
}) {
  const [scanValue, setScanValue] = useState("");
  const [selectedReference, setSelectedReference] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [feedback, setFeedback] = useState<{
    tone: "ok" | "warn" | "danger";
    message: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);

  const activeItems = useMemo(
    () => items.filter((item) => item.deletedAt == null),
    [items],
  );
  const activeDemands = useMemo(
    () =>
      demands.filter(
        (demand) =>
          demand.deletedAt == null &&
          demand.status !== "fulfilled" &&
          demand.status !== "superseded",
      ),
    [demands],
  );
  const ingredientName = (id: string) =>
    ingredients.find((item) => item._id === id)?.name ?? "Unknown ingredient";
  const locationName = (id: string) =>
    locations.find((item) => item._id === id)?.name ?? "Unknown location";
  const eventName = (id: string) =>
    events.find((item) => item._id === id)?.title ?? "Unknown event";

  const selectedItemReference = selectedReference.startsWith("inventory:")
    ? selectedReference.slice("inventory:".length)
    : null;
  const selectedDemandReference = selectedReference.startsWith("demand:")
    ? selectedReference.slice("demand:".length)
    : null;
  const selectedDemand = activeDemands.find(
    (demand) => demand._id === selectedDemandReference,
  );
  const candidateItems = useMemo(
    () =>
      selectedItemReference
        ? activeItems.filter((item) => item._id === selectedItemReference)
        : selectedDemand
          ? activeItems.filter(
              (item) => item.ingredientId === selectedDemand.ingredientId,
            )
          : [],
    [activeItems, selectedDemand, selectedItemReference],
  );
  const selectedItem = candidateItems.find(
    (item) => item._id === selectedItemId,
  );

  useEffect(() => {
    const nextId = selectedItemReference
      ? (candidateItems[0]?._id ?? "")
      : candidateItems.length === 1
        ? candidateItems[0]._id
        : candidateItems.some((item) => item._id === selectedItemId)
          ? selectedItemId
          : "";
    setSelectedItemId(nextId);
  }, [candidateItems, selectedItemId, selectedItemReference]);

  useEffect(() => {
    setUnitCost(selectedItem ? String(selectedItem.unitCost) : "");
  }, [selectedItem]);

  const stopCamera = useCallback(() => {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const applyScan = useCallback(
    (value: string) => {
      const resolution = resolveStockReceiptScan(
        value,
        activeItems,
        activeDemands,
      );
      setScanValue(value);
      if (resolution.status === "found") {
        setSelectedReference(resolution.reference);
        setFeedback({
          tone: "ok",
          message: resolution.reference.startsWith("demand:")
            ? "Demand found. Confirm the receiving location and quantity."
            : "Stock line found. Enter the received quantity.",
        });
        return true;
      }
      setSelectedReference("");
      setFeedback({
        tone: resolution.status === "ambiguous" ? "warn" : "danger",
        message:
          resolution.status === "ambiguous"
            ? "That code matches more than one receiving target. Choose the target below."
            : "No open stock line or active demand matches that code.",
      });
      return false;
    },
    [activeDemands, activeItems],
  );

  const startCamera = async () => {
    if (cameraOpen) {
      stopCamera();
      return;
    }
    const Detector = (
      globalThis as typeof globalThis & {
        BarcodeDetector?: BarcodeDetectorConstructor;
      }
    ).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setFeedback({
        tone: "warn",
        message:
          "Camera scanning is unavailable in this browser. Use a USB scanner or type the label code.",
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      setCameraOpen(true);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const video = videoRef.current;
      if (!video) throw new Error("Camera preview did not open.");
      video.srcObject = stream;
      await video.play();
      const detector = new Detector();

      const detectFrame = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const results = await detector.detect(videoRef.current);
          const rawValue = results.find((result) => result.rawValue)?.rawValue;
          if (rawValue && applyScan(rawValue)) {
            stopCamera();
            return;
          }
        } catch {
          setFeedback({
            tone: "danger",
            message:
              "The camera could not read that label. Hold it steady or use the scanner input.",
          });
        }
        frameRef.current = requestAnimationFrame(() => void detectFrame());
      };
      frameRef.current = requestAnimationFrame(() => void detectFrame());
    } catch (error) {
      stopCamera();
      setFeedback({
        tone: "danger",
        message:
          error instanceof Error && error.name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access or use a USB scanner."
            : "The camera could not be opened. Use a USB scanner or type the label code.",
      });
    }
  };

  const submitScan = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    applyScan(scanValue);
  };

  const submitReceipt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const receivedQuantity = Number(quantity);
    const receivedUnitCost = unitCost.trim() ? Number(unitCost) : undefined;
    if (!selectedItem) {
      setFeedback({
        tone: "warn",
        message: "Choose the stock line that should receive this delivery.",
      });
      return;
    }
    if (!Number.isFinite(receivedQuantity) || receivedQuantity <= 0) {
      setFeedback({
        tone: "warn",
        message: "Enter a received quantity greater than zero.",
      });
      return;
    }
    if (
      receivedUnitCost != null &&
      (!Number.isFinite(receivedUnitCost) || receivedUnitCost < 0)
    ) {
      setFeedback({
        tone: "warn",
        message: "Unit cost cannot be negative.",
      });
      return;
    }

    setSubmitting(true);
    try {
      await onReceive({
        item: selectedItem,
        demand: selectedDemand,
        quantity: receivedQuantity,
        unitCost: receivedUnitCost,
      });
      setFeedback({
        tone: "ok",
        message: `${receivedQuantity} ${selectedItem.unit} received into ${locationName(selectedItem.locationId)}.`,
      });
      setScanValue("");
      setSelectedReference("");
      setSelectedItemId("");
      setQuantity("");
      setUnitCost("");
    } catch (error) {
      setFeedback({
        tone: "danger",
        message:
          error instanceof Error
            ? error.message
            : "The receipt could not be recorded. Try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      className="stock-receipt-dock"
      aria-labelledby="stock-receipt-title"
    >
      <div className="stock-receipt-intro">
        <div className="stock-receipt-mark">
          <BarcodeMark />
        </div>
        <div>
          <p className="eyebrow">Receiving dock</p>
          <h2 id="stock-receipt-title">Scan stock in</h2>
          <p>
            Scan a Capsule stock or demand label. USB scanners type directly;
            camera scanning works when the browser supports it.
          </p>
        </div>
      </div>

      <div className="stock-receipt-workspace">
        <form className="stock-receipt-scan" onSubmit={submitScan}>
          <label className="field-label" htmlFor="stock-receipt-code">
            Barcode or QR code
          </label>
          <div className="stock-receipt-scan-row">
            <input
              id="stock-receipt-code"
              data-testid="stock-receipt-code"
              className="input"
              value={scanValue}
              onChange={(event) => setScanValue(event.target.value)}
              placeholder="Scan or type a label, then press Enter"
              autoComplete="off"
              inputMode="text"
            />
            <button className="btn btn-primary" type="submit">
              Find
            </button>
            <button
              data-testid="stock-receipt-camera"
              className="btn btn-ghost"
              type="button"
              aria-pressed={cameraOpen}
              onClick={() => void startCamera()}
            >
              {cameraOpen ? "Close camera" : "Use camera"}
            </button>
          </div>
          <span className="stock-receipt-hint">
            Accepted labels contain an InventoryItem or IngredientDemand
            reference.
          </span>
          {cameraOpen ? (
            <div
              className="stock-receipt-camera"
              data-testid="stock-receipt-preview"
            >
              <video
                ref={videoRef}
                muted
                playsInline
                aria-label="Barcode camera preview"
              />
              <span>Center the code inside the frame</span>
            </div>
          ) : null}
        </form>

        <form
          className="stock-receipt-form"
          onSubmit={(event) => void submitReceipt(event)}
        >
          <label className="field-label">
            Receiving target
            <select
              data-testid="stock-receipt-target"
              className="input"
              value={selectedReference}
              onChange={(event) => {
                setSelectedReference(event.target.value);
                setFeedback(null);
              }}
              required
            >
              <option value="">Select stock line or demand</option>
              <optgroup label="Stock lines">
                {activeItems.map((item) => (
                  <option key={item._id} value={`inventory:${item._id}`}>
                    {ingredientName(item.ingredientId)} ·{" "}
                    {locationName(item.locationId)}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Active demand">
                {activeDemands.map((demand) => (
                  <option key={demand._id} value={`demand:${demand._id}`}>
                    {ingredientName(demand.ingredientId)} ·{" "}
                    {eventName(demand.eventId)}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          {selectedDemand ? (
            <div className="stock-receipt-demand-note">
              <span>Demand context</span>
              <strong>{eventName(selectedDemand.eventId)}</strong>
              <small>
                {selectedDemand.requiredQuantity} {selectedDemand.unit}{" "}
                requested · {formatStatusLabel(String(selectedDemand.status))}
              </small>
            </div>
          ) : null}

          {selectedReference ? (
            <label className="field-label">
              Stock line
              <select
                data-testid="stock-receipt-item"
                className="input"
                value={selectedItemId}
                onChange={(event) => setSelectedItemId(event.target.value)}
                required
              >
                <option value="">
                  {candidateItems.length === 0
                    ? "No matching stock line"
                    : "Select receiving location"}
                </option>
                {candidateItems.map((item) => (
                  <option key={item._id} value={item._id}>
                    {ingredientName(item.ingredientId)} ·{" "}
                    {locationName(item.locationId)} · {item.quantityOnHand}{" "}
                    {item.unit} on hand
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="stock-receipt-numbers">
            <label className="field-label">
              Quantity received
              <div className="stock-receipt-number-input">
                <input
                  data-testid="stock-receipt-quantity"
                  className="input"
                  type="number"
                  min={0.0001}
                  step="any"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  required
                />
                <span>
                  {selectedItem?.unit ?? selectedDemand?.unit ?? "units"}
                </span>
              </div>
            </label>
            <label className="field-label">
              Unit cost <span className="stock-receipt-optional">optional</span>
              <div className="stock-receipt-number-input stock-receipt-money">
                <span>$</span>
                <input
                  data-testid="stock-receipt-unit-cost"
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={unitCost}
                  onChange={(event) => setUnitCost(event.target.value)}
                />
              </div>
            </label>
          </div>

          <button
            data-testid="stock-receipt-submit"
            className="btn btn-primary stock-receipt-submit"
            disabled={submitting || !selectedItem}
          >
            {submitting ? "Receiving…" : "Receive stock"}
          </button>
        </form>
      </div>

      {feedback ? (
        <div
          data-testid="stock-receipt-feedback"
          className={`stock-receipt-feedback ${FEEDBACK_TONE_CLASS[feedback.tone]}`}
          role={feedback.tone === "danger" ? "alert" : "status"}
        >
          <span aria-hidden="true" />
          {feedback.message}
        </div>
      ) : null}
    </section>
  );
}
