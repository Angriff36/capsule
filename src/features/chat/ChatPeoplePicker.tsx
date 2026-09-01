import { useEffect, useRef, type MouseEvent } from "react";
import { AtSignIcon } from "./chatIcons";
import { keepOptionInView } from "./chatPickerScroll";

export type ChatPickerPerson = {
  readonly personId: string;
  readonly name: string;
};

export type ChatPeoplePickerProps = {
  /** Picker id (the `aria-controls` target); option ids are `${id}-${index}`. */
  readonly id: string;
  readonly people: readonly ChatPickerPerson[];
  readonly activeIndex: number;
  readonly onActiveIndexChange: (index: number) => void;
  readonly onPick: (person: ChatPickerPerson) => void;
};

/** Keep the textarea focused while the mouse picks an option. */
const keepFocus = (event: MouseEvent<HTMLButtonElement>) =>
  event.preventDefault();

/** The `@` menu: teammates matching the typed fragment. Controlled by the composer. */
export function ChatPeoplePicker({
  id,
  people,
  activeIndex,
  onActiveIndexChange,
  onPick,
}: ChatPeoplePickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    keepOptionInView(pickerRef.current, `${id}-${activeIndex}`);
  }, [id, activeIndex, people]);

  return (
    <div ref={pickerRef} id={id} className="chat-picker">
      <div role="listbox" aria-label="Teammates">
        {people.map((person, index) => (
          <button
            key={person.personId}
            type="button"
            role="option"
            id={`${id}-${index}`}
            aria-selected={index === activeIndex}
            onMouseDown={keepFocus}
            onMouseEnter={() => onActiveIndexChange(index)}
            onClick={() => onPick(person)}
          >
            <AtSignIcon width={14} height={14} className="text-ink-3" />
            <span className="min-w-0 truncate">{person.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
