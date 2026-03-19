export function SetupHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="text-center mb-10">
      <h2 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">{title}</h2>
      <p className="mt-4 max-w-lg text-gray-400 leading-relaxed">{subtitle}</p>
    </div>
  );
}
