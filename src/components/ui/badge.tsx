import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// Solid-fill "rating chip" style — Zomato's own badges (delivery rating,
// veg/non-veg, offer tags) are always a solid color with white text, never
// a soft tint. `brand`/`gold`/`green` here follow that convention instead
// of the shadcn-default pastel look.
const badgeVariants = cva('inline-flex items-center rounded-sm2 px-2.5 py-1 text-[11px] font-extrabold transition-colors', {
  variants: {
    variant: {
      default: 'bg-surface-alt text-ink-soft',
      brand: 'bg-brand text-white',
      gold: 'bg-gold text-white',
      green: 'bg-green text-white',
      red: 'bg-red text-white',
      outline: 'border border-border text-ink-soft',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
