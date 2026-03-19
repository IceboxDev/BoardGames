interface ToggleGroupOption<T extends string | number> {
  value: T;
  label: string;
  sublabel?: string;
}

interface ToggleGroupProps<T extends string | number> {
  options: ToggleGroupOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accentClass?: string;
}

export function ToggleGroup<T extends string | number>({
  options,
  value,
  onChange,
  accentClass = "bg-indigo-600 text-white",
}: ToggleGroupProps<T>) {
  return (
    <div className="flex gap-3">
      {options.map((opt) => (
        <button
          type="button"
          key={String(opt.value)}
          onClick={() => onChange(opt.value)}
          className={`flex-1 rounded-lg py-3 text-sm font-medium transition-colors ${
            value === opt.value ? accentClass : "bg-surface-800 text-gray-400 hover:bg-surface-700"
          }`}
        >
          {opt.label}
          {opt.sublabel && <div className="mt-1 text-xs opacity-60">{opt.sublabel}</div>}
        </button>
      ))}
    </div>
  );
}
