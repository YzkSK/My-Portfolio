import * as React from "react"
import { cn } from "@/lib/utils"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-lg border border-[#e0e0e0] bg-white px-3 py-1 text-base md:text-sm text-[#1a1a1a] shadow-none transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-400 focus-visible:outline-none focus-visible:border-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#333] dark:bg-[#111] dark:text-[#e0e0e0] dark:placeholder:text-[#555] dark:focus-visible:border-[#888]",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
