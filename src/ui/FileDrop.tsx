import {
  forwardRef,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { UploadIcon } from "./icons";
import "./ui-layouts.css";

type FileDropProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** The words in the zone, e.g. "Drop the price list here". */
  label?: ReactNode;
  /** One short line under the label, e.g. "CSV or Excel, up to 10 MB". */
  hint?: ReactNode;
  /** "row" is one slim line for toolbars and forms; "zone" is the tall box. */
  layout?: "zone" | "row";
};

/**
 * A drop zone around a real file input, adapted from ui-layouts "File Upload"
 * (MIT, see ui-layouts.LICENSE.txt). It replaces the browser's bare "Choose
 * file" control. Callers keep their own `onChange` and `ref`: a dropped file
 * is put into the input and fires the same change event a click would, so a
 * caller that resets `input.value` still works.
 */
export const FileDrop = forwardRef<HTMLInputElement, FileDropProps>(
  function FileDrop(
    {
      label = "Drop a file here",
      hint,
      layout = "zone",
      className,
      onChange,
      disabled,
      multiple,
      id,
      ...input
    },
    ref,
  ) {
    const ownId = useId();
    const inputId = id ?? ownId;
    const inner = useRef<HTMLInputElement | null>(null);
    const [dragging, setDragging] = useState(false);
    const [chosen, setChosen] = useState<string | null>(null);

    const setRefs = (node: HTMLInputElement | null) => {
      inner.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    };

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      setChosen(
        files && files.length > 0
          ? files.length === 1
            ? files[0].name
            : `${files.length} files`
          : null,
      );
      onChange?.(event);
    };

    const onDrop = (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      setDragging(false);
      const node = inner.current;
      if (disabled || !node || event.dataTransfer.files.length === 0) return;
      const transfer = new DataTransfer();
      const dropped = Array.from(event.dataTransfer.files);
      for (const file of multiple ? dropped : dropped.slice(0, 1))
        transfer.items.add(file);
      node.files = transfer.files;
      node.dispatchEvent(new Event("change", { bubbles: true }));
    };

    return (
      <label
        htmlFor={inputId}
        className={`file-drop file-drop-${layout}${className ? ` ${className}` : ""}`}
        data-dragging={dragging || undefined}
        data-disabled={disabled || undefined}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <span className="file-drop-icon" aria-hidden="true">
          <UploadIcon width={18} height={18} />
        </span>
        <span className="file-drop-text">
          <span className="file-drop-label">
            {chosen ?? label}
            {chosen ? null : (
              <>
                {" "}
                <span className="file-drop-browse">or browse</span>
              </>
            )}
          </span>
          {hint ? <span className="file-drop-hint">{hint}</span> : null}
        </span>
        <input
          {...input}
          ref={setRefs}
          id={inputId}
          type="file"
          multiple={multiple}
          disabled={disabled}
          onChange={handleChange}
          className="sr-only"
        />
      </label>
    );
  },
);
