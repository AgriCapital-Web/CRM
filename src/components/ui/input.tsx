import * as React from "react";

import { cn } from "@/lib/utils";

export type InputProps = React.ComponentProps<"input"> & { uppercase?: boolean };

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, uppercase, onChange, onBlur, ...props }, ref) => {
    const shouldUppercase = false;

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!shouldUppercase) {
        onChange?.(event);
        return;
      }

      const value = event.target.value.toUpperCase();
      const nextEvent = {
        ...event,
        target: { ...event.target, value },
        currentTarget: { ...event.currentTarget, value },
      } as React.ChangeEvent<HTMLInputElement>;
      onChange?.(nextEvent);
    };

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
      if (!shouldUppercase) {
        onBlur?.(event);
        return;
      }

      const value = event.target.value.toUpperCase();
      const nextEvent = {
        ...event,
        target: { ...event.target, value },
        currentTarget: { ...event.currentTarget, value },
      } as React.FocusEvent<HTMLInputElement>;
      onChange?.(nextEvent as unknown as React.ChangeEvent<HTMLInputElement>);
      onBlur?.(event);
    };

    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          shouldUppercase && "uppercase",
          className,
        )}
        ref={ref}
        onChange={handleChange}
        onBlur={handleBlur}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
