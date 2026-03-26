import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[#1a1a1a] text-white",
        secondary: "border-transparent bg-gray-100 text-gray-700",
        outline: "border-[#d0d0d0] text-gray-600",
        warning: "border-yellow-300 bg-yellow-50 text-yellow-700",
        success: "border-green-300 bg-green-50 text-green-700",
        destructive: "border-transparent bg-red-100 text-red-600",
      },
    },
    defaultVariants: {
      variant: "secondary",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
