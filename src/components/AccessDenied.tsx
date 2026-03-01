type AccessDeniedProps = {
  title?: string;
  message?: string;
};

export function AccessDenied({
  title = "Access denied",
  message = "You need admin permissions to view this page.",
}: AccessDeniedProps) {
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-3 px-6 py-20 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-slate-300">{message}</p>
    </section>
  );
}
