"use client";

export function PulirDescripcion({ id }: { id: string }) {
  return <input type="hidden" data-hora={id} />;
}
