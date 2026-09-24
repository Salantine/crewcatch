import { cn } from "@/lib/cn";
import { useId, type InputHTMLAttributes, type ReactNode } from "react";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Shown below the input; also becomes the accessible description. */
  hint?: ReactNode;
  error?: string;
}

/*
 * Inputs use --border-strong (3.05:1 on navy) rather than --border-subtle
 * (1.48:1). A control boundary a user must perceive is a non-text UI component
 * and needs 3:1; a decorative divider does not.
 */
export function Field({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: FieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className="text-xs font-semibold uppercase tracking-wider text-fg-muted"
      >
        {label}
      </label>

      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(hintId, errorId) || undefined}
        className={cn(
          "h-11 w-full bg-surface-1 px-3 text-fg",
          "border border-border-strong",
          "placeholder:text-fg-subtle",
          "focus:bg-surface-3",
          "aria-[invalid=true]:border-urgency-critical",
          className,
        )}
        {...props}
      />

      {hint && (
        <p id={hintId} className="text-xs text-fg-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-urgency-critical">
          {error}
        </p>
      )}
    </div>
  );
}
