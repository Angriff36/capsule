import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import {
  PasswordConfirmCheck,
  PasswordHoverIndicator,
  PasswordInlineIndicator,
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
          "ui-layouts Password (https://ui-layouts.com/components/password): password fields with a show/hide toggle and strength meters. Hover Indicator, Inline Indicator and Confirm Pass show the requirement list in a hover card.",
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
export const HoverIndicator: Story = {
  render: () => <PasswordHoverIndicator />,
};
export const InlineIndicator: Story = {
  render: () => <PasswordInlineIndicator />,
};
export const ConfirmPass: Story = { render: () => <PasswordConfirmCheck /> };
