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
        // soft tile (light scenes)
        tile: "bg-white/[0.04] text-foreground border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/12",
        // muted/outline (e.g. 'Uit')
        outline: "bg-transparent text-[var(--muted)] border border-white/12 hover:bg-white/[0.05] hover:text-foreground",
        // circular control (stepper, power)
        control: "rounded-full border border-white/12 bg-white/[0.03] text-foreground hover:bg-white/[0.08]",
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
