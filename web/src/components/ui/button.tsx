import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-colors select-none " +
    "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 press",
  {
    variants: {
      variant: {
        primary: "bg-coral text-[#171b24] hover:brightness-[1.04] shadow-sm",
        secondary: "bg-surface text-fg border border-border hover:bg-muted shadow-sm",
        ghost: "text-fg hover:bg-muted",
        blue: "bg-blue text-white hover:brightness-110 shadow-sm",
        success: "bg-success text-white hover:brightness-105 shadow-sm",
        danger: "bg-danger-soft text-danger hover:brightness-95",
        ink: "bg-ink text-surface hover:opacity-90",
      },
      size: {
        sm: "h-8 px-3 text-[13px] rounded-[var(--radius-sm)]",
        md: "h-10 px-4 text-sm rounded-[var(--radius)]",
        lg: "h-12 px-5 text-[15px] rounded-[var(--radius)]",
        xl: "h-14 px-6 text-base rounded-[var(--radius-lg)]",   // touch POS / KDS
        icon: "size-10 rounded-[var(--radius)]",
        iconSm: "size-8 rounded-[var(--radius-sm)]",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, type = "button", ...props }, ref) => (
  <button ref={ref} type={type} data-variant={variant ?? "secondary"} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = "Button";
