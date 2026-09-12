'use client';

import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-surface group-[.toaster]:text-ink group-[.toaster]:border-line group-[.toaster]:shadow-elevated group-[.toaster]:rounded-lg2',
          description: 'group-[.toast]:text-ink-soft',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-surface-alt group-[.toast]:text-ink-soft',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
