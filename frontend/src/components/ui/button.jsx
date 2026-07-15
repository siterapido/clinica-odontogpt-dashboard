import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 ease-out outline-none disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "bg-primary-600 text-white shadow-card hover:bg-primary-700 hover:shadow-card-lg hover:-translate-y-0.5",
        outline:
          "border border-border bg-surface-2 text-ink hover:bg-surface-1 hover:border-primary-300",
        ghost: "text-ink-secondary hover:bg-surface-1 hover:text-ink",
        danger: "text-danger hover:bg-red-50",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-9 px-3 text-[0.85rem]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
