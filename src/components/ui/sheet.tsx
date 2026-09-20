'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetPortal = DialogPrimitive.Portal;
const SheetClose = DialogPrimitive.Close;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // Same z-[100] as Dialog — must clear the app shell's fixed chrome.
      'fixed inset-0 z-[100] bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

/** Slide-over panel from the right — the primary view/edit/create surface
 * for a list row (Invoices, Customers, Products), replacing the old
 * split master-detail column and the centered add/edit Dialog alike.
 * Full-screen on mobile, a fixed-width panel from sm: up. */
const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { wide?: boolean }
>(({ className, children, wide, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed inset-y-0 right-0 z-[100] flex h-full w-full max-w-full flex-col overflow-hidden border-l border-line bg-surface shadow-elevated duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
        wide ? 'sm:max-w-[560px]' : 'sm:max-w-[480px]',
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 z-10 flex h-7 w-7 items-center justify-center rounded-sm2 bg-bg text-ink-faint transition-colors hover:bg-brand-light hover:text-brand focus:outline-none">
        <X size={14} />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = 'SheetContent';

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-shrink-0 items-center gap-2.5 border-b border-line py-[19px] pl-[22px] pr-12', className)} {...props} />
);
SheetHeader.displayName = 'SheetHeader';

const SheetIcon = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <span className={cn('flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-sm2 bg-brand-light text-brand-dark', className)}>{children}</span>
);
SheetIcon.displayName = 'SheetIcon';

/** Sits right under SheetHeader — Overview/Edit style tabs, when a sheet
 * needs both a read-only view and a form (Customers, Products). Invoices'
 * sheet has no edit mode and skips this entirely. */
const SheetTabs = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-shrink-0 gap-1 border-b border-line px-[18px] pt-2', className)} {...props} />
);
SheetTabs.displayName = 'SheetTabs';

const SheetTab = ({ active, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) => (
  <button
    type="button"
    className={cn(
      'rounded-t-sm2 border-b-2 px-3 py-2 text-[12.5px] font-bold transition-colors',
      active ? 'border-brand text-brand' : 'border-transparent text-ink-faint hover:text-ink-soft',
      className
    )}
    {...props}
  />
);
SheetTab.displayName = 'SheetTab';

const SheetBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex-1 overflow-y-auto p-[22px]', className)} {...props} />
);
SheetBody.displayName = 'SheetBody';

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-shrink-0 flex-wrap items-center justify-between gap-2.5 border-t border-line bg-surface px-[22px] py-4', className)} {...props} />
);
SheetFooter.displayName = 'SheetFooter';

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-[15px] font-extrabold text-ink', className)} {...props} />
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-[11.5px] text-ink-faint', className)} {...props} />
));
SheetDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Sheet,
  SheetTrigger,
  SheetPortal,
  SheetClose,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetIcon,
  SheetTabs,
  SheetTab,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
