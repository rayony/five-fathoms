import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-medium transition-[opacity,transform,background-color] duration-[var(--motion-fast)] ease-[var(--ease-smooth-out)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:opacity-90",
        secondary:
          "border border-border bg-surface text-fg hover:bg-surface-2",
        ghost: "text-muted hover:text-fg hover:bg-surface",
        danger: "bg-danger text-fg hover:opacity-90",
        stay: "bg-accent text-accent-fg hover:opacity-90",
        leave: "border border-danger/50 bg-danger/15 text-fg hover:bg-danger/25",
      },
      size: {
        md: "h-11 rounded-[12px] px-4 text-sm",
        lg: "h-14 rounded-[16px] px-5 text-base",
        sm: "h-9 rounded-[10px] px-3 text-sm",
        icon: "size-11 rounded-[12px]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
