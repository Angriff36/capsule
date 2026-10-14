import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  createContext,
  useContext,
  useId,
  useState,
  type ReactNode,
} from "react";
import { ChevronDownIcon } from "./icons";
import "./ui-layouts.css";

type AccordionState = {
  isOpen: (value: string) => boolean;
  toggle: (value: string) => void;
};

const AccordionContext = createContext<AccordionState | null>(null);
const ItemContext = createContext<{ value: string; id: string } | null>(null);

function useAccordion() {
  const accordion = useContext(AccordionContext);
  const item = useContext(ItemContext);
  if (!accordion || !item)
    throw new Error("Accordion parts must sit inside an AccordionItem");
  return { ...item, open: accordion.isOpen(item.value), accordion };
}

/**
 * Sections that fold open and shut, adapted from ui-layouts "Accordion" (MIT,
 * see ui-layouts.LICENSE.txt). It replaces bare <details> blocks: the panel
 * grows to its height instead of jumping, and the header is a real button
 * with aria-expanded. `multiple` lets more than one section stay open.
 */
export function Accordion({
  children,
  multiple = false,
  defaultValue = [],
  className,
}: {
  children: ReactNode;
  multiple?: boolean;
  defaultValue?: readonly string[];
  className?: string;
}) {
  const [openValues, setOpenValues] = useState<readonly string[]>(defaultValue);
  const state: AccordionState = {
    isOpen: (value) => openValues.includes(value),
    toggle: (value) =>
      setOpenValues((current) =>
        current.includes(value)
          ? current.filter((entry) => entry !== value)
          : multiple
            ? [...current, value]
            : [value],
      ),
  };
  return (
    <MotionConfig reducedMotion="user">
      <AccordionContext.Provider value={state}>
        <div className={`ui-accordion${className ? ` ${className}` : ""}`}>
          {children}
        </div>
      </AccordionContext.Provider>
    </MotionConfig>
  );
}

export function AccordionItem({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  const id = useId();
  const accordion = useContext(AccordionContext);
  return (
    <ItemContext.Provider value={{ value, id }}>
      <div
        className="ui-accordion-item"
        data-open={accordion?.isOpen(value) || undefined}
      >
        {children}
      </div>
    </ItemContext.Provider>
  );
}

export function AccordionHeader({
  children,
  meta,
}: {
  children: ReactNode;
  /** Short facts on the right, before the chevron (a count, a status). */
  meta?: ReactNode;
}) {
  const { id, value, open, accordion } = useAccordion();
  return (
    <h3 className="ui-accordion-heading">
      <button
        type="button"
        id={`${id}-header`}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        className="ui-accordion-header"
        onClick={() => accordion.toggle(value)}
      >
        <span className="ui-accordion-title">{children}</span>
        {meta ? <span className="ui-accordion-meta">{meta}</span> : null}
        <ChevronDownIcon
          className="ui-accordion-chevron"
          width={14}
          height={14}
        />
      </button>
    </h3>
  );
}

export function AccordionPanel({ children }: { children: ReactNode }) {
  const { id, open } = useAccordion();
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          id={`${id}-panel`}
          role="region"
          aria-labelledby={`${id}-header`}
          className="ui-accordion-panel"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: "spring", bounce: 0, duration: 0.3 }}
        >
          <div className="ui-accordion-body">{children}</div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
