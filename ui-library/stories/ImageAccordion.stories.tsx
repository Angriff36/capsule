import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import ImageAccordion from "../components/image-accordions";
import TailwindImageAccordion from "../components/image-accordions-tailwind";

const meta: Meta = {
  title: "UI Layouts Library/Disclosure/Image Accordion",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Image Accordion (https://ui-layouts.com/components/image-accordions): a strip of photos where the hovered or clicked one widens to show its caption. The second story is the pure Tailwind variant (hover/focus only, no JavaScript state).",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const HoverAccordion: Story = { render: () => <ImageAccordion /> };
export const TailwindHoverAccordion: Story = {
  render: () => <TailwindImageAccordion />,
};
