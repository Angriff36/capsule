import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import {
  PasswordInput,
  PasswordStrengthBar,
  PasswordStrengthSegments,
} from "../components/password";

const meta: Meta = {
  title: "UI Layouts Library/Forms/Password",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Password (https://ui-layouts.com/components/password): password fields with a show/hide toggle and strength meters. The docs' hover-card variants need @radix-ui/react-hover-card and are not ported.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Basic: Story = { render: () => <PasswordInput /> };
export const StrengthBar: Story = { render: () => <PasswordStrengthBar /> };
export const StrengthSegments: Story = {
  render: () => <PasswordStrengthSegments />,
};
