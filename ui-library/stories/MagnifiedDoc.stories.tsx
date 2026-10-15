import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/magnified-doc";

const meta: Meta = {
  title: "UI Layouts Library/Navigation/Magnified Doc",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Magnified Doc (https://ui-layouts.com/components/magnified-doc): the Radix tooltip primitives used by the Mac Genie dock (translucent, blurred, animated). See the Mac Genie story for the magnified dock itself.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <TooltipProvider>
      <div className="flex justify-center gap-4 py-10">
        {["Menu", "Staff", "Timeline"].map((label) => (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded-md border px-4 py-2 text-sm"
              >
                {label}
              </button>
            </TooltipTrigger>
            <TooltipContent>Open {label.toLowerCase()}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  ),
};
