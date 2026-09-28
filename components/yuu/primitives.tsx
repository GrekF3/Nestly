"use client";

import type { ReactNode } from "react";
import { Check, X } from "lucide-react";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function YuuFormField({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return <label className="yuu-form-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}{error && <small className="yuu-field-error">{error}</small>}</label>;
}

export function YuuFeedback({ children, kind = "success" }: { children: ReactNode; kind?: "success" | "error" }) {
  return <p className={`yuu-feedback ${kind}`} role={kind === "error" ? "alert" : "status"}>{kind === "success" ? <Check size={17} /> : <X size={17} />}{children}</p>;
}

export function YuuPrimaryButton({ pending, children, disabled = false }: { pending?: boolean; children: ReactNode; disabled?: boolean }) {
  return <button className="yuu-panel-primary" type="submit" disabled={pending || disabled}>{pending ? "Please wait…" : children}</button>;
}

export function YuuPanelTitle({ title, description }: { title: string; description: string }) {
  return <SheetHeader className="panel-header"><SheetTitle>{title}</SheetTitle><SheetDescription>{description}</SheetDescription></SheetHeader>;
}

export function YuuEmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="yuu-empty">{icon}<h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function YuuLoadingState({ label }: { label: string }) {
  return <div className="yuu-list-loading" role="status"><div /><div /><div /><span>{label}</span></div>;
}
