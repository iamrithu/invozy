'use client';

import * as React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker, getDefaultClassNames, type DayButton } from 'react-day-picker';
import { cn } from '@/lib/utils';

// shadcn/ui Calendar (react-day-picker v9), on the app's tokens: ink for a
// picked day and the ends of a range, the brand tint between them, 6px
// corners. `captionLayout="dropdown"` gives month and year dropdowns.

function Calendar({ className, classNames, showOutsideDays = true, captionLayout = 'label', components, ...props }: React.ComponentProps<typeof DayPicker>) {
  const d = getDefaultClassNames();
  const navButton =
    'inline-flex h-8 w-8 items-center justify-center rounded-sm2 border border-line bg-surface text-ink-soft transition-colors hover:bg-surface-alt hover:text-ink disabled:opacity-40 aria-disabled:opacity-40 select-none';

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      className={cn('bg-surface p-1', className)}
      classNames={{
        root: cn('w-fit', d.root),
        months: cn('relative flex flex-col gap-4 sm:flex-row', d.months),
        month: cn('flex w-full flex-col gap-3', d.month),
        nav: cn('absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1', d.nav),
        button_previous: cn(navButton, d.button_previous),
        button_next: cn(navButton, d.button_next),
        month_caption: cn('flex h-8 w-full items-center justify-center px-9', d.month_caption),
        dropdowns: cn('flex h-8 w-full items-center justify-center gap-1.5 text-[13px] font-bold', d.dropdowns),
        dropdown_root: cn('relative rounded-sm2 border border-line has-[:focus]:border-brand', d.dropdown_root),
        dropdown: cn('absolute inset-0 cursor-pointer opacity-0', d.dropdown),
        caption_label: cn(
          'select-none text-[13px] font-bold text-ink',
          captionLayout === 'label' ? '' : 'flex h-8 items-center gap-1 rounded-sm2 pl-2 pr-1.5 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:text-ink-faint',
          d.caption_label
        ),
        month_grid: 'w-full border-collapse',
        weekdays: cn('flex', d.weekdays),
        weekday: cn('flex-1 select-none text-[11px] font-semibold text-ink-faint', d.weekday),
        week: cn('mt-1 flex w-full', d.week),
        day: cn('relative aspect-square h-full w-full select-none p-0 text-center', d.day),
        range_start: cn('rounded-l-sm2 bg-brand-light', d.range_start),
        range_middle: cn('rounded-none', d.range_middle),
        range_end: cn('rounded-r-sm2 bg-brand-light', d.range_end),
        today: cn('[&>button]:font-extrabold [&>button]:text-brand', d.today),
        outside: cn('[&>button]:text-ink-faint', d.outside),
        disabled: cn('[&>button]:cursor-not-allowed [&>button]:opacity-35', d.disabled),
        hidden: cn('invisible', d.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ className: c, orientation, ...rest }) =>
          orientation === 'left' ? (
            <ChevronLeft className={cn('h-4 w-4', c)} {...rest} />
          ) : orientation === 'right' ? (
            <ChevronRight className={cn('h-4 w-4', c)} {...rest} />
          ) : (
            <ChevronDown className={cn('h-4 w-4', c)} {...rest} />
          ),
        DayButton: CalendarDayButton,
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({ className, day, modifiers, ...props }: React.ComponentProps<typeof DayButton>) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <button
      ref={ref}
      type="button"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={modifiers.selected && !modifiers.range_start && !modifiers.range_end && !modifiers.range_middle}
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        'flex aspect-square h-auto w-full min-w-8 items-center justify-center rounded-sm2 text-[12.5px] font-medium leading-none text-ink-body transition-colors hover:bg-surface-alt hover:text-ink',
        'data-[selected-single=true]:bg-ink data-[selected-single=true]:text-surface',
        'data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-brand-light data-[range-middle=true]:text-ink',
        'data-[range-start=true]:bg-ink data-[range-start=true]:text-surface data-[range-end=true]:bg-ink data-[range-end=true]:text-surface',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
