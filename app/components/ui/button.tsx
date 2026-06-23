import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl font-medium " +
    "transition-all duration-200 select-none active:scale-[0.97] focus-visible:outline-none " +
    "focus-visible:ring-2 focus-visible:ring-[var(--ring)]/60 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        // light surface tile
        tile: "bg-[var(--card)] text-foreground border border-[var(--card-border)] hover:bg-black/[0.03]",
        // muted/outline
        outline: "bg-transparent text-[var(--muted)] border border-[var(--card-border)] hover:bg-black/[0.03] hover:text-foreground",
        // circular control used ON gradient tiles (translucent white)
        control: "rounded-full border border-white/30 bg-white/15 text-white hover:bg-white/25",
      },
      size: {
        tile: "h-[4.25rem] px-3 text-sm",
        icon: "h-12 w-12 text-2xl",
        power: "h-12 w-12 text-xl rounded-full",
      },
    },
    defaultVariants: { variant: "tile", size: "tile" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
