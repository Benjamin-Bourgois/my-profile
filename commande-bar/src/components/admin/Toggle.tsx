"use client";

/** Interrupteur de la charte (vert quand il est activé), zone tactile de 40 px. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex h-10 shrink-0 items-center disabled:opacity-45"
    >
      <span
        className={`relative inline-block h-6 w-[42px] rounded-full transition-colors duration-200 ${checked ? "bg-ok" : "bg-sand-3"}`}
      >
        <span
          className={`absolute left-[3px] top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.2)] transition-transform duration-[250ms] ease-chic ${
            checked ? "translate-x-[18px]" : ""
          }`}
        />
      </span>
    </button>
  );
}
