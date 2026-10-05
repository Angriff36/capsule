import type { Meta, StoryObj } from "@storybook/react-vite";
import { FieldHelp } from "./FieldHelp";

const meta: Meta<typeof FieldHelp> = {
  title: "Primitives/FieldHelp",
  component: FieldHelp,
  parameters: {
    docs: {
      description: {
        component:
          "Info icon beside a domain field label. Explains the term, how it feeds downstream math, and links to an example. Hover or focus previews; click, Enter or Space pins; Escape closes. Wording lives in `src/ui/fieldHelpTerms.ts`.",
      },
    },
  },
  args: { term: "yield" },
};
export default meta;
type Story = StoryObj<typeof FieldHelp>;

export const InFormLabel: Story = {
  render: (args) => (
    <label className="field-label w-64">
      <span className="field-label-row">
        Yield
        <FieldHelp {...args} />
      </span>
      <input className="input" type="number" defaultValue={1} />
    </label>
  ),
};

export const AllTerms: Story = {
  render: () => (
    <div className="grid w-64 gap-3">
      {(
        [
          ["Yield", "yield"],
          ["Yield on a dish", "dishYield"],
          ["Batch multiplier", "batchMultiplier"],
          ["PAR level", "parLevel"],
          ["Purchase", "purchaseEligibility"],
        ] as const
      ).map(([label, term]) => (
        <span key={term} className="field-label-row text-xs font-semibold">
          {label}
          <FieldHelp term={term} />
        </span>
      ))}
    </div>
  ),
};
