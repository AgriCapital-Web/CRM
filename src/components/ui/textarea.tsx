import * as React from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { uppercase?: boolean };

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, uppercase = true, onChange, onBlur, ...props }, ref) => {
  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!uppercase) {
      onChange?.(event);
      return;
    }
    const value = event.target.value.toUpperCase();
    const nextEvent = {
      ...event,
      target: { ...event.target, value },
      currentTarget: { ...event.currentTarget, value },
    } as React.ChangeEvent<HTMLTextAreaElement>;
    onChange?.(nextEvent);
  };
  const handleBlur = (event: React.FocusEvent<HTMLTextAreaElement>) => {
    if (!uppercase) {
      onBlur?.(event);
      return;
    }
    const value = event.target.value.toUpperCase();
    const nextEvent = { ...event, target: { ...event.target, value }, currentTarget: { ...event.currentTarget, value } } as React.FocusEvent<HTMLTextAreaElement>;
    onChange?.(nextEvent as unknown as React.ChangeEvent<HTMLTextAreaElement>);
    onBlur?.(event);
  };
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        uppercase && "uppercase",
        className,
      )}
      ref={ref}
      onChange={handleChange}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
