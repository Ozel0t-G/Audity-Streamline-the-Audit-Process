import { ButtonHTMLAttributes, ReactNode, forwardRef } from "react";

type Variant = "primary" | "secondary" | "soft" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "audity-btn-primary",
  secondary: "audity-btn-secondary",
  soft: "audity-btn-soft",
  ghost: "audity-btn-ghost",
  danger: "audity-btn-danger"
};

const SIZE_CLASS: Record<Size, string> = {
  sm: "audity-btn-sm",
  md: "",
  lg: "audity-btn-lg"
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    isLoading,
    leftIcon,
    rightIcon,
    fullWidth,
    disabled,
    className = "",
    children,
    type = "button",
    ...rest
  },
  ref
) {
  const classes = [
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    fullWidth ? "w-full" : "",
    "relative", // for absolute spinner overlay
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      aria-disabled={disabled || isLoading || undefined}
      aria-busy={isLoading || undefined}
      className={classes}
      {...rest}
    >
      {leftIcon ? (
        <span className={`shrink-0 ${isLoading ? "opacity-0" : ""}`} aria-hidden="true">
          {leftIcon}
        </span>
      ) : null}
      <span className={`min-w-0 ${isLoading ? "opacity-0" : ""}`}>{children}</span>
      {rightIcon ? (
        <span className={`shrink-0 ${isLoading ? "opacity-0" : ""}`} aria-hidden="true">
          {rightIcon}
        </span>
      ) : null}
      {isLoading ? (
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          aria-hidden="true"
        >
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
            <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </span>
      ) : null}
    </button>
  );
});

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  label: string;
  size?: "sm" | "md";
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, size = "md", className = "", type = "button", ...rest },
  ref
) {
  const sizeClass = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={`audity-btn-icon ${sizeClass} ${className}`}
      {...rest}
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  );
});
