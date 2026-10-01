import type { Meta, StoryObj } from "@storybook/react-vite";
import { BarcodeLabel } from "./BarcodeLabel";

const meta: Meta<typeof BarcodeLabel> = {
  title: "Primitives/BarcodeLabel",
  component: BarcodeLabel,
  parameters: {
    docs: {
      description: {
        component:
          "Printable bar label (Code 39) and QR code for equipment, trucks and events. The Scan box on a load sheet reads either. The QR code carries the record itself. Both stay black on white in both schemes.",
      },
    },
  },
  args: {
    code: "CHAF-014",
    title: "Chafer - stainless steel",
    subtitle: "Warehouse A, rack 1",
  },
};
export default meta;
type Story = StoryObj<typeof BarcodeLabel>;

export const Equipment: Story = {};

export const Event: Story = {
  args: { code: "EV-5935", title: "Ewing Wedding", subtitle: "Sep 26, 2026" },
};

export const WithQrCode: Story = {
  args: {
    code: "CHAF-014",
    qr: "capsule://equipment/k57abc123def456",
    title: "Chafer - stainless steel",
    subtitle: "Warehouse A, rack 1",
  },
};

export const QrOnly: Story = {
  args: {
    code: undefined,
    qr: "capsule://event/k57event000000001",
    title: "Ewing Wedding",
    subtitle: "Sep 26, 2026",
  },
};

export const LongCode: Story = {
  args: {
    code: "VH-WA E2E0728",
    title: "Dodge Ram",
    subtitle: undefined,
  },
};
