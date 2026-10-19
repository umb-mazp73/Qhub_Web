import type { ReactNode } from 'react';

/** Cabecera de Inicio: saludo, fecha, resumen en una frase y las acciones más probables del rol. */
export function HomeHero({ breadcrumb, title, date, summary, actions }: { breadcrumb: string; title: string; date: string; summary: string; actions: ReactNode }) {
  return (
    <section className="mb-4 bg-brand-ink p-6 text-white sm:p-8 print:border print:border-border-subtle print:bg-transparent print:text-text-primary">
      <div className="min-w-0 max-w-[620px]">
        <div className="t-caption text-sidebar-text">{breadcrumb}</div>
        <h1 className="t-h1 mb-1">{title}</h1>
        <p className="t-caption mb-1 text-sidebar-text">{date}</p>
        <p className="mb-5 text-sidebar-text-active">{summary}</p>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>
    </section>
  );
}
