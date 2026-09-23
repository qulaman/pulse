"use client";

import { Key } from "@/components/ui/device/Device";
import { KEY_LABEL, type DeskAction } from "@/lib/tasks/desk";

import { Icon, type IconName } from "./icons";

const KEY_ICON: Record<DeskAction, IconName> = {
  approve: "check",
  rework: "rotate",
  answer: "reply",
  insist: "send",
  reassign: "swap",
  cancel: "x",
  extend: "clock",
  revoke: "undo",
  open: "open",
  remove: "x",
};

/**
 * The three keys under the display. Always three cells: a state with fewer commands
 * leaves a dark key without a label, so the grid never moves under the thumb.
 */
export function DeskKeys({
  keys,
  disabled = false,
  onPress,
}: {
  keys: readonly DeskAction[];
  disabled?: boolean;
  onPress: (action: DeskAction) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[0, 1, 2].map((slot) => {
        const action = disabled ? undefined : keys[slot];
        if (!action) return <Key key={`empty-${slot}`} tall disabled aria-hidden tabIndex={-1} />;
        return (
          <Key key={action} tall icon={<Icon name={KEY_ICON[action]} size={18} />} data-testid={`desk-key-${action}`} onClick={() => onPress(action)}>
            <span className="max-w-full px-1 tracking-[-0.02em]">{KEY_LABEL[action]}</span>
          </Key>
        );
      })}
    </div>
  );
}
