import { useMemo, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  useCreateSavedReportDefinition,
  useListSavedReportDefinition,
  useSavedReportDefinitionArchive,
} from "../../../lib/manifest-convex-react";
import { useActionPrompt } from "../../../ui/action-prompt/useActionPrompt";
import { LETTER_TEXT_MARKER, savedLetterTexts } from "./savedLetterTexts";

/** The old TPP letter writer's "Body Message" list and "Edit Messages". */
export function SavedLetterTextPicker({
  target,
}: {
  target: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
}) {
  const rows = useListSavedReportDefinition();
  const create = useCreateSavedReportDefinition();
  const archive = useSavedReportDefinitionArchive();
  const { prompt, host } = useActionPrompt();
  const texts = useMemo(
    () =>
      savedLetterTexts(
        rows as Parameters<typeof savedLetterTexts>[0] | undefined,
      ),
    [rows],
  );
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const selected = texts.find((text) => text.id === selectedId) ?? null;

  const pick = (id: string) => {
    setSelectedId(id);
    setMessage(null);
    const text = texts.find((row) => row.id === id);
    if (text && target.current) target.current.value = text.text;
  };

  const save = async () => {
    const text = target.current?.value.trim() ?? "";
    if (!text) {
      setMessage("Write the letter text first, then save it.");
      return;
    }
    const values = await prompt.askFields({
      title: "Save this letter text",
      description: "Everyone on the team can pick it for their letters.",
      fields: [{ name: "name", label: "Name", required: true }],
      confirmLabel: "Save",
    });
    const name = String(values?.name ?? "").trim();
    if (!name) return;
    try {
      await create({
        name,
        subjectArea: "sales",
        chartType: LETTER_TEXT_MARKER,
        sharingScope: "team",
        definition: { text },
      });
      setMessage(`Saved "${name}".`);
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Couldn't save this text.",
      );
    }
  };

  const remove = async () => {
    if (!selected) return;
    try {
      await archive({ docId: selected.id, version: selected.version });
      setSelectedId("");
      setMessage(`Removed "${selected.name}".`);
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Couldn't remove this text.",
      );
    }
  };

  return (
    <div className="tpp-saved-texts">
      <label>
        <span>Saved letter text</span>
        <select
          className="input"
          value={selectedId}
          onChange={(event) => pick(event.target.value)}
        >
          <option value="">
            {texts.length === 0 ? "No saved texts yet" : "Pick a saved text"}
          </option>
          {texts.map((text) => (
            <option key={text.id} value={text.id}>
              {text.name}
            </option>
          ))}
        </select>
      </label>
      <button
        className="btn btn-ghost btn-sm"
        type="button"
        onClick={() => void save()}
      >
        Save this text
      </button>
      {selected ? (
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          onClick={() => void remove()}
        >
          Remove saved text
        </button>
      ) : null}
      {message ? (
        <small className="tpp-parameter-hint" role="status">
          {message}
        </small>
      ) : null}
      {/* Outside the report form, and its submit stops here, so saving a
          text never runs the report. */}
      {createPortal(
        <div onSubmit={(event) => event.stopPropagation()}>{host}</div>,
        document.body,
      )}
    </div>
  );
}
