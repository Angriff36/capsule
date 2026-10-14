import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import SidebarMenuDemo from "../components/liquid-glass-sidebar-menu";
import WeatherDemo from "../components/liquid-glass-weather";
import MobileIconsDemo from "../components/liquid-glass-mobile-icons";
import NotificationDemo from "../components/liquid-glass-notification";

const meta: Meta = {
  title: "UI Layouts Library/Visual Effects/Liquid Glass",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Liquid Glass (https://ui-layouts.com/components/liquid-glass): Glassmorphism card with a distorted backdrop blur, inner highlights and optional drag and click-to-expand.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const SidebarMenu: Story = { render: () => <SidebarMenuDemo /> };
export const Weather: Story = { render: () => <WeatherDemo /> };
export const MobileIcons: Story = { render: () => <MobileIconsDemo /> };
export const Notification: Story = { render: () => <NotificationDemo /> };
