import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { libraryFrame } from "../LibraryFrame";
import {
  ButtonActive,
  ButtonAnimatedGradient,
  ButtonBackgroundShine,
  ButtonBlackShadow,
  ButtonClickDown,
  ButtonCreativeRight,
  ButtonCreativeTop,
  ButtonCrossArrow,
  ButtonHover14,
  ButtonHoverDown,
  ButtonHoverLeftFlip,
  ButtonHoverMultiple,
  ButtonHoverOutLine,
  ButtonHoverRight,
  ButtonHoverTopFlip,
  ButtonHoverTopSlowFlip,
  ButtonHoverUnderLine,
  ButtonRotatingGradient,
  ButtonTextChange,
} from "../components/buttons";

const meta: Meta = {
  title: "UI Layouts Library/Forms/Buttons",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Creative Buttons (https://ui-layouts.com/components/buttons): buttons with hover, press and focus effects. One story per variant on the docs page.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

function Stage({ children }: { children: ReactNode }) {
  return (
    <div className="grid place-content-center rounded-lg border bg-muted py-16">
      {children}
    </div>
  );
}

export const AnimatedGradient: Story = {
  render: () => (
    <Stage>
      <ButtonAnimatedGradient />
    </Stage>
  ),
};
export const BackgroundShine: Story = {
  render: () => (
    <Stage>
      <ButtonBackgroundShine />
    </Stage>
  ),
};
export const Active: Story = {
  render: () => (
    <Stage>
      <ButtonActive />
    </Stage>
  ),
};
export const HoverRight: Story = {
  render: () => (
    <Stage>
      <ButtonHoverRight />
    </Stage>
  ),
};
export const CreativeRight: Story = {
  render: () => (
    <Stage>
      <ButtonCreativeRight />
    </Stage>
  ),
};
export const CreativeTop: Story = {
  render: () => (
    <Stage>
      <ButtonCreativeTop />
    </Stage>
  ),
};
export const ClickDown: Story = {
  render: () => (
    <Stage>
      <ButtonClickDown />
    </Stage>
  ),
};
export const HoverDown: Story = {
  render: () => (
    <Stage>
      <ButtonHoverDown />
    </Stage>
  ),
};
export const HoverMultiple: Story = {
  render: () => (
    <Stage>
      <ButtonHoverMultiple />
    </Stage>
  ),
};
export const HoverUnderline: Story = {
  render: () => (
    <Stage>
      <ButtonHoverUnderLine />
    </Stage>
  ),
};
export const HoverTopFlip: Story = {
  render: () => (
    <Stage>
      <ButtonHoverTopFlip />
    </Stage>
  ),
};
export const HoverLeftFlip: Story = {
  render: () => (
    <Stage>
      <ButtonHoverLeftFlip />
    </Stage>
  ),
};
export const HoverTopSlowFlip: Story = {
  render: () => (
    <Stage>
      <ButtonHoverTopSlowFlip />
    </Stage>
  ),
};
export const TextChange: Story = {
  render: () => (
    <Stage>
      <ButtonTextChange />
    </Stage>
  ),
};
export const CrossArrow: Story = {
  render: () => (
    <Stage>
      <ButtonCrossArrow />
    </Stage>
  ),
};
export const BlackShadow: Story = {
  render: () => (
    <Stage>
      <ButtonBlackShadow />
    </Stage>
  ),
};
export const HoverOutline: Story = {
  render: () => (
    <Stage>
      <ButtonHoverOutLine />
    </Stage>
  ),
};
export const ScheduleCall: Story = {
  render: () => (
    <Stage>
      <ButtonHover14 />
    </Stage>
  ),
};
export const RotatingGradient: Story = {
  render: () => (
    <Stage>
      <ButtonRotatingGradient />
    </Stage>
  ),
};
