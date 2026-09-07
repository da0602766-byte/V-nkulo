"use client";

export default function CloseDetailsBackdrop({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      onClick={(event) => {
        const details = event.currentTarget.closest("details");
        if (details instanceof HTMLDetailsElement) details.open = false;
      }}
    />
  );
}
