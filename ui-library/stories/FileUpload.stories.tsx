import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import { Toaster } from "sonner";
import { FileUploadChat } from "../components/file-upload-chat";
import { FileUploadDefault } from "../components/file-upload-default";
import { FileUploadImgPreview } from "../components/file-upload-img-preview";

const meta: Meta = {
  title: "UI Layouts Library/Forms/File Upload",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts File Upload (https://ui-layouts.com/components/file-upload): a drag-and-drop file field with keyboard navigation. Variants: default list, image previews, chat attachment.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <>
      <Toaster />
      <FileUploadDefault />
    </>
  ),
};
export const ImagePreview: Story = {
  render: () => (
    <>
      <Toaster />
      <FileUploadImgPreview />
    </>
  ),
};
export const Chat: Story = {
  render: () => (
    <>
      <Toaster />
      <FileUploadChat />
    </>
  ),
};
