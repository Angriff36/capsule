import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { libraryFrame } from "../LibraryFrame";
import { ShimmerLoader } from "../components/shimmer-loader";

const meta: Meta = {
  title: "UI Layouts Library/Animation & Motion/Shimmer Loader",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Shimmer Loader (https://ui-layouts.com/components/shimmer-loader): a terminal-style progress bar with a moving shimmer, cycling labels and icons, a percent and a token counter. Each bar restarts when it finishes.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

function Demo() {
  const [key, setKey] = useState(0);
  const handleComplete = () => setKey((prev) => prev + 1);

  return (
    <div className="p-10 flex flex-col gap-5 max-w-3xl mx-auto bg-black">
      <ShimmerLoader
        key={key}
        labels={["Analysing.", "Analysing..", "Analysing..."]}
        icons={["✦", "◆", "✶", "❋", "✸"]}
        duration={3000}
        tokenTarget={0.16}
        showPercent={true}
        fontSize={14}
        paddingY={4}
        cellPadding={2}
        textClassName="text-purple-200/90"
        onComplete={handleComplete}
      />
      <ShimmerLoader
        key={key + 1}
        labels={["Booting…", "Loading…", "Preparing…", "Initializing…"]}
        icons={["✦", "◆", "✶", "❋", "✸"]}
        duration={3000}
        tokenTarget={0.8}
        showPercent={true}
        fontSize={14}
        paddingY={4}
        cellPadding={2}
        textClassName="text-purple-200/90"
        onComplete={handleComplete}
      />
      <ShimmerLoader
        key={key + 2}
        labels={["Syncing…", "Configuring…", "Setting up…", "Onboarding…"]}
        icons={["◈", "◉", "⬡", "⬢", "◍"]}
        duration={3000}
        tokenTarget={0.92}
        showPercent={true}
        fontSize={14}
        paddingY={4}
        cellPadding={2}
        textClassName="text-purple-200/90"
        onComplete={handleComplete}
      />
    </div>
  );
}

export const Default: Story = { render: () => <Demo /> };
