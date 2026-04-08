'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

function Switch({
  className,
  defaultChecked,
  checked,
  disabled,
  ...props
}: React.ComponentProps<'button'> & {
  defaultChecked?: boolean;
  checked?: boolean;
}) {
  const [isOn, setIsOn] = React.useState(defaultChecked ?? checked ?? false);

  const active = checked !== undefined ? checked : isOn;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      disabled={disabled}
      data-state={active ? 'checked' : 'unchecked'}
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
        active ? 'bg-primary' : 'bg-input',
        className
      )}
      onClick={() => {
        if (!disabled) setIsOn(!active);
      }}
      {...props}
    >
      <span
        className={cn(
          'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform',
          active ? 'translate-x-4' : 'translate-x-0'
        )}
      />
    </button>
  );
}

export { Switch };
