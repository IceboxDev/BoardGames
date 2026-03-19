import type { ReactNode } from "react";

interface OptionCardProps {
  accentColor: string;
  onClick?: () => void;
  selected?: boolean;
  children: ReactNode;
  className?: string;
}

export function OptionCard({
  accentColor,
  onClick,
  selected,
  children,
  className = "",
}: OptionCardProps) {
  const Component = onClick ? "button" : "div";

  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`group relative flex flex-col rounded-xl border bg-gray-800/50 px-5 py-5 text-left transition-all duration-200 overflow-hidden ${
        selected
          ? "border-white/20 bg-gray-800/80 shadow-lg"
          : "border-gray-700/80 hover:bg-gray-800/80 hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5"
      } ${className}`}
      style={{
        borderLeftWidth: "3px",
        borderLeftColor: accentColor,
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: accentColor }}
      />
      {children}
    </Component>
  );
}
