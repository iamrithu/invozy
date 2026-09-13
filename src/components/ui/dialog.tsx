'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // z-[100]: must clear the app shell's fixed chrome (bottom-nav/top-bar
      // dropdowns sit at z-[60]) or a full-screen mobile dialog's footer
      // renders visually underneath the bottom nav bar.
      'fixed inset-0 z-[100] bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { mobileFullScreen?: boolean }
>(({ className, children, mobileFullScreen, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-[100] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl2 border border-line bg-surface p-6 shadow-elevated duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        // Opt-in: only dialogs that pass this (e.g. the invoice preview)
        // become full-screen below md — small confirms and the image
        // lightbox never set it, so they stay centered/compact everywhere.
        mobileFullScreen &&
          'max-md:inset-0 max-md:left-0 max-md:top-0 max-md:h-full max-md:max-h-full max-md:w-full max-md:max-w-full max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-0',
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm2 text-ink-faint transition-colors hover:text-ink focus:outline-none focus:ring-2 focus:ring-ring disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

/** Wide, form-shaped Dialog content: fixed max-height with the header/footer
 * pinned and only the body scrolling — a centered-modal equivalent of the
 * old Sheet's flex column, used by every converted add/edit form.
 *
 * Full-screen below md by default (mobile-first) — every usage of this
 * component is a real multi-field form, which benefits from the extra room
 * on a small screen; the centered card treatment returns at md: and up. */
const DialogFormContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { wide?: boolean }
>(({ className, children, wide, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed inset-0 z-[100] flex h-full max-h-full w-full max-w-full flex-col overflow-hidden rounded-none border-0 bg-surface p-0 shadow-elevated duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        'md:inset-auto md:left-[50%] md:top-[50%] md:h-auto md:max-h-[85vh] md:w-[calc(100%-2rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl2 md:border md:border-line',
        wide ? 'md:max-w-[640px]' : 'md:max-w-[520px]',
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-bg text-ink-faint transition-colors hover:bg-brand-light hover:text-brand focus:outline-none">
        <X size={14} />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogFormContent.displayName = 'DialogFormContent';

const DialogFormHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  // pr-12 (not px-[22px] on the right) leaves clear room for the close button,
  // which is absolutely positioned at right-4 with its own 28px hit area —
  // any header content that runs to the right edge (e.g. a trailing toggle)
  // would otherwise sit underneath it.
  <div className={cn('flex flex-shrink-0 items-center gap-2.5 border-b border-line py-[19px] pl-[22px] pr-12', className)} {...props} />
);
DialogFormHeader.displayName = 'DialogFormHeader';

const DialogFormIcon = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <span className={cn('flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full bg-brand-light text-brand-dark', className)}>{children}</span>
);
DialogFormIcon.displayName = 'DialogFormIcon';

const DialogFormBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex-1 overflow-y-auto p-[18px]', className)} {...props} />
);
DialogFormBody.displayName = 'DialogFormBody';

const DialogFormFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-shrink-0 flex-wrap justify-end gap-2.5 border-t border-line bg-bg px-[22px] py-4', className)} {...props} />
);
DialogFormFooter.displayName = 'DialogFormFooter';

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-1.5 text-left', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-[16px] font-extrabold text-ink', className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-[12.5px] text-ink-soft', className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogFormContent,
  DialogFormHeader,
  DialogFormIcon,
  DialogFormBody,
  DialogFormFooter,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
