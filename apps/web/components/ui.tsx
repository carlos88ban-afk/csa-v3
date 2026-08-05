import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Fragment } from "react";

// Componentes compartidos del sistema de diseño — ver
// docs/architecture/design-system.md. Sin librería de UI: primitivas
// mínimas sobre las clases de app/globals.css.

type ButtonVariant = "primary" | "secondary" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
}

export function Button({ variant = "secondary", size = "md", className, ...props }: ButtonProps) {
  const classes = ["btn", `btn--${variant}`, size === "sm" ? "btn--sm" : "", className]
    .filter(Boolean)
    .join(" ");
  return <button className={classes} {...props} />;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={["card", className].filter(Boolean).join(" ")}>{children}</div>;
}

type PillVariant = "neutral" | "accent" | "good" | "warn";

export function Pill({ children, variant = "neutral" }: { children: ReactNode; variant?: PillVariant }) {
  const classes = ["pill", variant !== "neutral" ? `pill--${variant}` : ""].filter(Boolean).join(" ");
  return <span className={classes}>{children}</span>;
}

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className="breadcrumb" aria-label="Ruta de navegación">
      {items.map((item, index) => (
        <Fragment key={index}>
          {index > 0 && <span className="breadcrumb__sep">›</span>}
          {item.href ? <a href={item.href}>{item.label}</a> : <span className="breadcrumb__current">{item.label}</span>}
        </Fragment>
      ))}
    </nav>
  );
}
