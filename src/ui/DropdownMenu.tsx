/**
 * Adapted from Origin UI's Radix dropdown: https://coss.com/origin/dropdown
 * MIT copyright (c) 2025 coss.com / Origin UI; see origin-ui.LICENSE.txt.
 * Styling uses Capsule tokens; behavior stays with Radix (focus, keyboard,
 * typeahead, dismissal, and collision-aware portalled positioning).
 */
import type { ComponentProps } from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { CheckIcon, ChevronRightIcon } from "./icons";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;
export const DropdownMenuRadioGroup = Menu.RadioGroup;
export const DropdownMenuSub = Menu.Sub;

const itemClass = "capsule-dropdown-item";

export function DropdownMenuContent({
  className = "",
  sideOffset = 4,
  ...props
}: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        className={`capsule-dropdown-content ${className}`}
        sideOffset={sideOffset}
        collisionPadding={8}
        {...props}
      />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({
  className = "",
  variant = "default",
  ...props
}: ComponentProps<typeof Menu.Item> & {
  variant?: "default" | "destructive";
}) {
  return (
    <Menu.Item
      className={`${itemClass} ${className}`}
      data-variant={variant}
      {...props}
    />
  );
}

export function DropdownMenuCheckboxItem({
  className = "",
  children,
  ...props
}: ComponentProps<typeof Menu.CheckboxItem>) {
  return (
    <Menu.CheckboxItem
      className={`${itemClass} capsule-dropdown-choice ${className}`}
      {...props}
    >
      <span className="capsule-dropdown-indicator" aria-hidden="true">
        <Menu.ItemIndicator>
          <CheckIcon width={16} height={16} />
        </Menu.ItemIndicator>
      </span>
      {children}
    </Menu.CheckboxItem>
  );
}

export function DropdownMenuRadioItem({
  className = "",
  children,
  ...props
}: ComponentProps<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem
      className={`${itemClass} capsule-dropdown-choice ${className}`}
      {...props}
    >
      <span className="capsule-dropdown-indicator" aria-hidden="true">
        <Menu.ItemIndicator>
          <span className="block size-2 rounded-full bg-current" />
        </Menu.ItemIndicator>
      </span>
      {children}
    </Menu.RadioItem>
  );
}

export function DropdownMenuLabel({
  className = "",
  ...props
}: ComponentProps<typeof Menu.Label>) {
  return (
    <Menu.Label className={`capsule-dropdown-label ${className}`} {...props} />
  );
}

export function DropdownMenuSeparator({
  className = "",
  ...props
}: ComponentProps<typeof Menu.Separator>) {
  return (
    <Menu.Separator
      className={`capsule-dropdown-separator ${className}`}
      {...props}
    />
  );
}

export function DropdownMenuSubTrigger({
  className = "",
  children,
  ...props
}: ComponentProps<typeof Menu.SubTrigger>) {
  return (
    <Menu.SubTrigger className={`${itemClass} ${className}`} {...props}>
      {children}
      <ChevronRightIcon className="ml-auto" width={16} height={16} />
    </Menu.SubTrigger>
  );
}

export function DropdownMenuSubContent({
  className = "",
  ...props
}: ComponentProps<typeof Menu.SubContent>) {
  return (
    <Menu.Portal>
      <Menu.SubContent
        className={`capsule-dropdown-content ${className}`}
        collisionPadding={8}
        {...props}
      />
    </Menu.Portal>
  );
}
