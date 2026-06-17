// Lists THEMES as selectable cards showing name + X/Y axis labels.

import type { Theme } from "~/game/types";
import { THEMES } from "~/game/themes";

interface GamePickerProps {
  selectedId?: string | null;
  onSelect: (theme: Theme) => void;
  /** Disable selection (e.g. guest waiting for host). */
  disabled?: boolean;
}

export function GamePicker({ selectedId, onSelect, disabled }: GamePickerProps) {
  return (
    <div className="grid w-full gap-3 sm:grid-cols-2">
      {THEMES.map((theme) => {
        const selected = theme.id === selectedId;
        return (
          <button
            key={theme.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(theme)}
            className={[
              "rounded-xl border-2 p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
              selected
                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/40"
                : "border-gray-200 bg-white hover:border-indigo-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-500",
            ].join(" ")}
          >
            <div className="text-lg font-bold text-gray-900 dark:text-white">
              {theme.name}
            </div>
            {theme.description && (
              <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                {theme.description}
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                X: {theme.xAxis.label}
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                Y: {theme.yAxis.label}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
