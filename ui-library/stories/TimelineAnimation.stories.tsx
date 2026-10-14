import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { libraryFrame } from "../LibraryFrame";
import { TimelineAnimation } from "../components/timeline-animation";

const meta: Meta = {
  title: "UI Layouts Library/Animation & Motion/Timeline Animation",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Timeline Animation (https://ui-layouts.com/components/timeline-animation): children reveal one after another (blur to sharp) once the section scrolls into view. animationNum sets the order.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

function Sequence() {
  const timelineRef = useRef<HTMLElement | null>(null);
  return (
    <section ref={timelineRef} className="mx-auto max-w-xl py-10 text-center">
      <TimelineAnimation
        as="h2"
        animationNum={0}
        timelineRef={timelineRef}
        className="text-4xl font-semibold"
      >
        Spring tasting menu
      </TimelineAnimation>
      <TimelineAnimation
        as="p"
        animationNum={1}
        timelineRef={timelineRef}
        className="mt-3 text-muted-foreground"
      >
        Five courses, one long table, forty guests on the terrace.
      </TimelineAnimation>
      <TimelineAnimation
        as="p"
        animationNum={2}
        timelineRef={timelineRef}
        className="mt-3 text-muted-foreground"
      >
        Doors at six. First course out at seven fifteen.
      </TimelineAnimation>
      <TimelineAnimation
        as="button"
        animationNum={3}
        timelineRef={timelineRef}
        className="mt-6 rounded-md bg-primary px-4 py-2 text-primary-foreground"
      >
        Confirm menu
      </TimelineAnimation>
    </section>
  );
}

export const Default: Story = { render: () => <Sequence /> };

function CustomVariants() {
  const timelineRef = useRef<HTMLElement | null>(null);
  const [run, setRun] = useState(0);
  return (
    <section ref={timelineRef} className="mx-auto max-w-xl py-6" key={run}>
      <button
        type="button"
        className="mb-4 rounded-md border px-3 py-1 text-sm"
        onClick={() => setRun((n) => n + 1)}
      >
        Replay
      </button>
      {["Load-in", "Setup", "Service", "Breakdown"].map((label, index) => (
        <TimelineAnimation
          key={label}
          animationNum={index}
          timelineRef={timelineRef}
          once={false}
          customVariants={{
            hidden: { opacity: 0, x: -40 },
            visible: (i: number) => ({
              opacity: 1,
              x: 0,
              transition: { delay: i * 0.25, duration: 0.4 },
            }),
          }}
          className="mb-2 rounded-md border bg-card p-3"
        >
          {index + 1}. {label}
        </TimelineAnimation>
      ))}
    </section>
  );
}

export const CustomVariantsStory: Story = {
  name: "Custom variants",
  render: () => <CustomVariants />,
};
