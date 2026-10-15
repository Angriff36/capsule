import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { libraryFrame } from "../LibraryFrame";
import { TagsInput } from "../components/tags-input";

const meta: Meta = {
  title: "UI Layouts Library/Forms/Tags Input",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Tags Input (https://ui-layouts.com/components/tags-input): type and press Enter or comma to add a tag; click a tag to edit it.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

const initialTags: string[] = [];

function Demo({ editTag = true }: { editTag?: boolean }) {
  const [tags, setTags] = useState(initialTags);
  return (
    <div className="max-w-xl mx-auto py-16">
      <TagsInput
        tags={tags}
        setTags={setTags}
        editTag={editTag}
        className="lg:w-96"
      />
    </div>
  );
}

export const Editable: Story = { render: () => <Demo /> };
export const NotEditable: Story = { render: () => <Demo editTag={false} /> };
