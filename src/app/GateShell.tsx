import { type ReactNode } from "react";

export function GateShell({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-6">
      <div className="card max-w-130 px-6 py-6">
        <CapsuleWordmark />
        <h1 className="mt-5 text-xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}

export function CapsuleWordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-6 w-6 place-items-center rounded-xs bg-accent font-mono text-sm font-bold text-white">
        C
      </span>
      <span className="text-base font-semibold tracking-[0.14em] uppercase">
        Capsule
      </span>
    </div>
  );
}
