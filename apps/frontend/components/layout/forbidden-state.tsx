export function ForbiddenState() {
  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-amber-950" role="alert">
      <h2 className="font-semibold">Bu kaynağa erişim yetkiniz yok.</h2>
      <p className="mt-1 text-sm">Yetki ve hastane kapsamı backend tarafından kontrol edilir. Erişim gerektiğini düşünüyorsanız yöneticinizle iletişime geçin.</p>
    </section>
  );
}
