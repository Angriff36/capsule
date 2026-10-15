import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import { CodeTabs } from "../components/code-tabs";

const meta: Meta = {
  title: "UI Layouts Library/Code/Code Tabs",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Code Tabs (https://ui-layouts.com/components/code-tabs): tabbed, syntax-highlighted install commands with a copy button. Highlighting loads on demand.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

function Demo() {
  return (
    <div className="w-full dark:bg-black bg-white p-4 rounded-lg">
      <CodeTabs
        tabs={[
          { id: "npm", label: "npm", code: "npm i thing", lang: "bash" },
          { id: "pnpm", label: "pnpm", code: "pnpm add thing", lang: "bash" },
          { id: "yarn", label: "yarn", code: "yarn add thing", lang: "bash" },
        ]}
        defaultValue="npm"
      />
      <CodeTabs
        tabs={[
          {
            id: "ui-layouts",
            label: "ui-layouts",
            code: "npx ui-layouts add code-tabs",
            lang: "bash",
          },
          {
            id: "shadcn",
            label: "shadcn",
            code: "npx shadcn@latest add code-tabs",
            lang: "bash",
          },
        ]}
        isLogos={true}
        defaultValue="ui-layouts"
      />
    </div>
  );
}

export const Default: Story = { render: () => <Demo /> };
