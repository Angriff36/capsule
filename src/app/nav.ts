import type { ComponentType, SVGProps } from "react";
import {
  BoxIcon,
  BuildingIcon,
  CalendarIcon,
  ChartIcon,
  CoinsIcon,
  ContactIcon,
  FlameIcon,
  GearIcon,
  HomeIcon,
  TruckIcon,
  UsersIcon,
} from "../ui/icons";

export interface NavArea {
  path: string;
  label: string;
  group: "Operate" | "People" | "Business" | "System";
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Areas that ship in a later slice render a single "planned" page. */
  planned?: string;
}

export const NAV_AREAS: NavArea[] = [
  { path: "/", label: "Home", group: "Operate", icon: HomeIcon },
  { path: "/events", label: "Events", group: "Operate", icon: CalendarIcon },
  {
    path: "/kitchen",
    label: "Kitchen",
    group: "Operate",
    icon: FlameIcon,
  },
  {
    path: "/inventory",
    label: "Inventory",
    group: "Operate",
    icon: BoxIcon,
  },
  {
    path: "/logistics",
    label: "Logistics",
    group: "Operate",
    icon: TruckIcon,
    planned: "Shipments, routes, drivers and vehicles.",
  },
  {
    path: "/staff",
    label: "Staff",
    group: "People",
    icon: UsersIcon,
    planned: "Scheduling, availability, certifications and payroll.",
  },
  {
    path: "/clients",
    label: "Clients & CRM",
    group: "People",
    icon: ContactIcon,
    planned: "Clients, leads, deals and interactions.",
  },
  {
    path: "/finance",
    label: "Finance",
    group: "Business",
    icon: CoinsIcon,
    planned: "Invoices, payments, budgets and profitability.",
  },
  {
    path: "/reports",
    label: "Reports",
    group: "Business",
    icon: ChartIcon,
    planned: "Event reports and operational summaries.",
  },
  {
    path: "/facilities",
    label: "Facilities",
    group: "System",
    icon: BuildingIcon,
    planned: "Facilities, equipment and maintenance work orders.",
  },
  {
    path: "/admin",
    label: "Administration",
    group: "System",
    icon: GearIcon,
    planned: "Users, roles, API keys and tenant settings.",
  },
];

export const NAV_GROUPS = ["Operate", "People", "Business", "System"] as const;
