import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import { ScrollFrame } from "../components/motion-scroll-frame";
import ScrollBaseAnimation from "../components/scroll-text-marquee";

const meta: Meta = {
  title: "UI Layouts Library/Animation & Motion/Text Marquee",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Text Marquee (https://ui-layouts.com/components/scroll-text-marquee): large text that glides sideways on its own and speeds up (and can flip direction) with your scroll speed. Scroll inside the box to feel it.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

const bigText =
  "font-bold tracking-[-0.07em] leading-[90%] text-4xl sm:text-6xl lg:text-8xl";

export const ScrollReactive: Story = {
  render: () => (
    <ScrollFrame height={420}>
      {(container) => (
        <div>
          <section className="h-[300px] grid place-content-center overflow-hidden">
            <ScrollBaseAnimation
              baseVelocity={3}
              scrollDependent
              clasname={bigText}
              container={container}
            >
              Best Component library For Developer
            </ScrollBaseAnimation>
          </section>
          <section className="h-[300px] grid place-content-center overflow-hidden">
            <ScrollBaseAnimation
              baseVelocity={-3}
              scrollDependent
              clasname={bigText}
              container={container}
            >
              Scroll this box to change the speed
            </ScrollBaseAnimation>
          </section>
          <section className="h-[300px]" />
        </div>
      )}
    </ScrollFrame>
  ),
};

export const Steady: Story = {
  render: () => (
    <section className="h-[300px] grid place-content-center overflow-hidden">
      <ScrollBaseAnimation baseVelocity={3} clasname={bigText}>
        Best Component library For Developer
      </ScrollBaseAnimation>
    </section>
  ),
};
