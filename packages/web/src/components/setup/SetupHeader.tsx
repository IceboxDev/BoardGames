export function SetupHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="text-center mb-10">
      <h2 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">{title}</h2>
      <p className="mt-4 max-w-xl text-gray-400 leading-relaxed line-clamp-1">{subtitle}</p>
    </div>
  );
}
