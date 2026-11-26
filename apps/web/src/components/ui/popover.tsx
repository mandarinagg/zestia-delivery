import * as Popover from '@radix-ui/react-popover';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const PopoverRoot = Popover.Root;
export const PopoverTrigger = Popover.Trigger;
export const PopoverAnchor = Popover.Anchor;
export const PopoverClose = Popover.Close;

export function PopoverContent({
  className,
  sideOffset = 6,
  align = 'start',
  ...props
}: ComponentProps<typeof Popover.Content>) {
  return (
    <Popover.Portal>
      <Popover.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={8}
        className={cn(
          'zd-pop z-50 w-72 max-w-[calc(100vw-16px)] rounded-lg border bg-raised text-foreground shadow-overlay outline-none',
          className,
        )}
        {...props}
      />
    </Popover.Portal>
  );
}

export const TooltipProvider = Tooltip.Provider;

/**
 * Tooltip para botones de solo ícono. El nombre accesible va en el botón (aria-label);
 * el tooltip es ayuda visual adicional, no reemplaza el nombre.
 */
export function Hint({
  label,
  children,
  side = 'bottom',
}: {
  label: ReactNode;
  children: ReactNode;
  side?: ComponentProps<typeof Tooltip.Content>['side'];
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={6}
          className="zd-pop z-50 flex items-center gap-2 rounded-sm bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground shadow-overlay"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
