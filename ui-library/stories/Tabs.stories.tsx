import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import { TabsBtn, TabsContent, TabsProvider } from "../components/tabs";

const meta: Meta = {
  title: "UI Layouts Library/Navigation/Tabs",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Tabs (https://ui-layouts.com/components/tabs): a sliding, wobbly highlight between tabs. Capsule's adapted version is SegmentedTabs under Controls / UI Layouts.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

function Demo({ wobbly = true, hover = false }) {
  return (
    <TabsProvider defaultValue="menu" wobbly={wobbly} hover={hover}>
      <div className="flex justify-center">
        <div className="flex items-center gap-1 rounded-md bg-muted p-1">
          <TabsBtn value="menu">
            <span className="relative z-2">Menu</span>
          </TabsBtn>
          <TabsBtn value="staff">
            <span className="relative z-2">Staff</span>
          </TabsBtn>
          <TabsBtn value="timeline">
            <span className="relative z-2">Timeline</span>
          </TabsBtn>
        </div>
      </div>
      <TabsContent value="menu">
        <p className="text-center">
          Short rib, roast chicken, mushroom risotto.
        </p>
      </TabsContent>
      <TabsContent value="staff">
        <p className="text-center">Six servers, two bartenders, one captain.</p>
      </TabsContent>
      <TabsContent value="timeline">
        <p className="text-center">Load-in 3:00, doors 6:00, dinner 7:15.</p>
      </TabsContent>
    </TabsProvider>
  );
}

export const Wobbly: Story = { render: () => <Demo /> };
export const Plain: Story = { render: () => <Demo wobbly={false} /> };
export const OnHover: Story = { render: () => <Demo hover /> };
