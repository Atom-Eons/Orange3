import { useCallback, useState } from "react";

interface Options {
  itemCount: number;
  onConfirm: (index: number) => void;
  onEscape?: () => void;
}

export function useKeyboardRovingIndex({ itemCount, onConfirm, onEscape }: Options) {
  const [activeIndex, setActiveIndex] = useState(0);

  const getItemProps = useCallback(
    (index: number) => ({
      role: "option",
      "aria-selected": activeIndex === index,
      tabIndex: activeIndex === index ? 0 : -1,
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setActiveIndex((current) => Math.min(itemCount - 1, current + 1));
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setActiveIndex((current) => Math.max(0, current - 1));
        }
        if (event.key === "Enter") {
          event.preventDefault();
          onConfirm(index);
        }
        if (event.key === "Escape") {
          event.preventDefault();
          onEscape?.();
        }
      },
    }),
    [activeIndex, itemCount, onConfirm, onEscape],
  );

  return { activeIndex, setActiveIndex, getItemProps };
}
