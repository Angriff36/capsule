import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  useListEquipment,
  useListEquipmentReservation,
  useListEventVehicleAssignment,
  useListVehicle,
  usePackListItemMarkPacked,
  usePackListItemRecordChecked,
  usePackListItemRecordLoaded,
  usePackListItemRecordPackedCount,
  usePackListItemRecordReturn,
  usePackListStartPacking,
} from "../../lib/manifest-convex-react";
import { BarcodeLabel } from "../../ui/BarcodeLabel";
import { classifyCommandFailure } from "../events/CommandFailure";
import {
  applyScan,
  findScanTarget,
  parseScanLabel,
  SCAN_OUTCOME_TEXT,
  SCAN_STEPS,
  scanLabelFor,
  type ScanLine,
  type ScanStep,
} from "./packScan";
import type { PackRig } from "./packViews";

interface BarcodeDetectorInstance {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>;
}
interface BarcodeDetectorConstructor {
  new (): BarcodeDetectorInstance;
}

type Line = ScanLine & { version: number; unit: string };
type Entry = { at: number; ok: boolean; text: string };

const QUICK_AMOUNTS = [1, 5, 10];

/**
 * Scan box on a load sheet. Pick the step (pack, second check, on truck,
 * came back), then scan the bar label on each piece with a USB scanner or
 * the camera, or type the tag number. Each scan adds the amount to that
 * line's count for the step; a line with no label can be picked from the
 * list instead.
 */
export function PackScanPanel({
  packList,
  eventNumber,
  lines,
  rigs,
}: {
  packList: { _id: string; version: number; eventId: string; status: string };
  eventNumber?: string | null;
  lines: Line[];
  rigs: PackRig[];
}) {
  const equipment = useListEquipment();
  const reservations = useListEquipmentReservation();
  const assignments = useListEventVehicleAssignment();
  const vehicles = useListVehicle();
  const startPacking = usePackListStartPacking();
  const markPacked = usePackListItemMarkPacked();
  const recordPackedCount = usePackListItemRecordPackedCount();
  const recordChecked = usePackListItemRecordChecked();
  const recordLoaded = usePackListItemRecordLoaded();
  const recordReturn = usePackListItemRecordReturn();

  const [step, setStep] = useState<ScanStep>("pack");
  const [code, setCode] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [truckId, setTruckId] = useState("");
  const [pickedLineId, setPickedLineId] = useState("");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<Entry[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);

  const say = (ok: boolean, text: string) =>
    setRecent((rows) => [{ at: Date.now(), ok, text }, ...rows].slice(0, 8));

  const stopCamera = useCallback(() => {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
  }, []);
  useEffect(() => stopCamera, [stopCamera]);

  const scanRigs = rigs.map((rig) => {
    const row = (assignments ?? []).find((entry) => entry._id === rig.id);
    const vehicle = (vehicles ?? []).find(
      (entry) => entry._id === row?.vehicleId,
    );
    return {
      id: rig.id,
      vehicleId: row?.vehicleId ?? null,
      plate: vehicle?.registration ?? null,
    };
  });

  const save = async (line: Line, amount: number): Promise<void> => {
    const result = applyScan(step, line, amount, truckId || null);
    const name = line.description;
    if (result.outcome !== "ok" || !result.change) {
      say(false, `${name}: ${SCAN_OUTCOME_TEXT[result.outcome]}`);
      return;
    }
    const change = result.change;
    const args = { docId: line._id, version: line.version };
    setBusy(true);
    try {
      if (change.step === "pack") {
        if (packList.status === "draft")
          await startPacking({
            docId: packList._id,
            version: packList.version,
          });
        await (change.full ? markPacked : recordPackedCount)({
          ...args,
          packedQuantity: change.packedQuantity,
        });
        say(
          true,
          `${name}: packed ${change.packedQuantity} of ${line.requiredQuantity} ${line.unit}`,
        );
      } else if (change.step === "check") {
        await recordChecked({
          ...args,
          checkedQuantity: change.checkedQuantity,
        });
        say(
          true,
          `${name}: checked ${change.checkedQuantity} of ${line.packedQuantity}`,
        );
      } else if (change.step === "load") {
        await recordLoaded({ ...args, loadedQuantity: change.loadedQuantity });
        say(
          true,
          `${name}: ${change.loadedQuantity} of ${line.packedQuantity} on the truck`,
        );
      } else {
        await recordReturn({
          ...args,
          returnedQuantity: change.returnedQuantity,
          usedQuantity: Number(line.usedQuantity ?? 0),
          lostQuantity: Number(line.lostQuantity ?? 0),
          damagedQuantity: Number(line.damagedQuantity ?? 0),
        });
        say(
          true,
          `${name}: ${change.returnedQuantity} of ${line.packedQuantity} back`,
        );
      }
    } catch (error) {
      say(false, `${name}: ${classifyCommandFailure(error).title}`);
    } finally {
      setBusy(false);
    }
  };

  const amount = () => {
    const value = Number(quantity);
    return Number.isFinite(value) && value > 0 ? value : 1;
  };

  const handleLabel = async (raw: string): Promise<void> => {
    const target = parseScanLabel(raw);
    if (!target) return;
    const found = findScanTarget(target, {
      eventId: packList.eventId,
      eventNumber,
      lines,
      equipment: equipment ?? [],
      reservations: (reservations ?? []).map((row) => ({
        ...row,
        status: String(row.status),
      })),
      rigs: scanRigs,
    });
    if (found.found === "event") {
      say(true, "Right event: this label is for this list's event.");
      return;
    }
    if (found.found === "truck") {
      setTruckId(found.rigId);
      const label =
        rigs.find((rig) => rig.id === found.rigId)?.label ?? "Truck";
      say(
        true,
        step === "load"
          ? `Loading onto ${label}.`
          : `${label} is on this event. Pick "On truck" to load it.`,
      );
      return;
    }
    if (found.found === "none") {
      say(false, `${raw.trim()}: ${SCAN_OUTCOME_TEXT[found.outcome]}`);
      return;
    }
    const line = lines.find((row) => row._id === found.line._id);
    if (line) await save(line, amount());
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = code;
    setCode("");
    void handleLabel(value);
  };

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
      say(
        false,
        "This browser can't scan with the camera. Use a USB scanner or type the tag number.",
      );
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
          const raw = results.find((result) => result.rawValue)?.rawValue;
          if (raw) {
            stopCamera();
            await handleLabel(raw);
            return;
          }
        } catch {
          // A frame the detector can't read is normal; keep looking.
        }
        frameRef.current = requestAnimationFrame(() => void detectFrame());
      };
      frameRef.current = requestAnimationFrame(() => void detectFrame());
    } catch (error) {
      stopCamera();
      say(
        false,
        error instanceof Error && error.name === "NotAllowedError"
          ? "Camera permission was denied. Allow the camera, or use a USB scanner."
          : "The camera could not be opened. Use a USB scanner or type the tag number.",
      );
    }
  };

  const pickable = lines.filter((line) => line.excludedAt == null);
  const stepLabel = SCAN_STEPS.find((entry) => entry.step === step)!.label;

  return (
    <section
      className="mt-3 rounded-sm border border-line-2 bg-panel p-3"
      aria-label="Scan labels"
      data-testid="pack-scan-panel"
    >
      <p className="eyebrow">Scan labels</p>
      <nav className="fact-row mt-2" aria-label="Scan step">
        {SCAN_STEPS.map((entry) => (
          <button
            key={entry.step}
            type="button"
            className={
              entry.step === step
                ? "btn btn-primary btn-sm"
                : "btn btn-ghost btn-sm"
            }
            aria-pressed={entry.step === step}
            onClick={() => setStep(entry.step)}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <form
        className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
        onSubmit={submit}
      >
        <label className="field-label">
          <span>Tag number or label</span>
          <input
            className="input min-h-10 w-full"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Scan, or type and press Enter"
            autoComplete="off"
            data-testid="pack-scan-code"
          />
        </label>
        <label className="field-label">
          <span>Amount each scan</span>
          <input
            className="input min-h-10 w-24"
            type="number"
            min="1"
            step="any"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
        <button
          type="submit"
          className="btn btn-primary min-h-10"
          disabled={busy || !code.trim()}
        >
          {stepLabel}
        </button>
        <button
          type="button"
          className="btn btn-ghost min-h-10"
          aria-pressed={cameraOpen}
          onClick={() => void startCamera()}
        >
          {cameraOpen ? "Close camera" : "Use camera"}
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-2">
        {QUICK_AMOUNTS.map((value) => (
          <button
            key={value}
            type="button"
            className={
              String(value) === quantity
                ? "btn btn-primary btn-sm"
                : "btn btn-ghost btn-sm"
            }
            onClick={() => setQuantity(String(value))}
          >
            {value}
          </button>
        ))}
      </div>

      {cameraOpen ? (
        <div className="mt-3">
          <video
            ref={videoRef}
            className="max-h-64 w-full rounded-sm border border-line bg-black"
            muted
            playsInline
            aria-label="Camera preview"
          />
          <p className="mt-1 text-sm text-ink-2">
            Hold the label inside the picture.
          </p>
        </div>
      ) : null}

      {step === "load" && rigs.length > 1 ? (
        <label className="field-label mt-3 max-w-sm">
          <span>Truck being loaded</span>
          <select
            className="input min-h-10 w-full"
            value={truckId}
            onChange={(event) => setTruckId(event.target.value)}
          >
            <option value="">Any truck</option>
            {rigs.map((rig) => (
              <option key={rig.id} value={rig.id}>
                {rig.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const line = lines.find((row) => row._id === pickedLineId);
          if (line) void save(line, amount());
        }}
      >
        <label className="field-label min-w-0 flex-1 basis-64">
          <span>No label? Pick the line</span>
          <select
            className="input min-h-10 w-full"
            value={pickedLineId}
            onChange={(event) => setPickedLineId(event.target.value)}
          >
            <option value="">Select a pack line</option>
            {pickable.map((line) => (
              <option key={line._id} value={line._id}>
                {line.description} · {line.packedQuantity} of{" "}
                {line.requiredQuantity} packed
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="btn btn-ghost min-h-10"
          disabled={busy || !pickedLineId}
        >
          {stepLabel} {amount()}
        </button>
      </form>

      <details className="mt-3">
        <summary className="cursor-pointer text-base text-ink-2">
          Print labels for this event and its trucks
        </summary>
        <div className="mt-3 flex flex-wrap gap-5">
          {eventNumber?.trim() ? (
            <BarcodeLabel
              code={scanLabelFor.event(eventNumber)}
              title={`Event #${eventNumber.trim()}`}
            />
          ) : (
            <p className="text-base text-ink-2">
              This event has no number yet, so it has no label. Number it on the
              event tracker.
            </p>
          )}
          {scanRigs
            .filter((rig) => rig.plate?.trim())
            .map((rig) => (
              <BarcodeLabel
                key={rig.id}
                code={scanLabelFor.vehicle(rig.plate ?? "")}
                title={rigs.find((row) => row.id === rig.id)?.label ?? "Truck"}
              />
            ))}
        </div>
        <p className="mt-2 text-sm text-ink-2">
          Equipment labels print from each item on the equipment page.
        </p>
      </details>

      {recent.length > 0 ? (
        <ul className="mt-3 divide-y divide-line" aria-live="polite">
          {recent.map((entry) => (
            <li
              key={entry.at}
              className={`py-1.5 text-base ${entry.ok ? "text-ink" : "text-danger"}`}
              role={entry.ok ? undefined : "alert"}
            >
              {entry.ok ? "✓" : "✕"} {entry.text}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
