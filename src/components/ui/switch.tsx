'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(({ className, ...props }, ref) => (
  <label className={cn('relative inline-flex h-[22px] w-[38px] flex-shrink-0 cursor-pointer items-center', className)}>
    <input ref={ref} type="checkbox" className="peer sr-only" {...props} />
    <span className="absolute inset-0 rounded-full bg-surface-alt transition-colors peer-checked:bg-brand" />
    <span className="absolute left-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
  </label>
));
Switch.displayName = 'Switch';

export { Switch };
