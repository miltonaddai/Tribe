import { useEffect, useId, useRef, useState } from "react";

export type DropdownOption<T extends string> = { id: T; label: string };

export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: DropdownOption<T>[];
  onChange: (id: T) => void;
  ariaLabel?: string;
}) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.id === value)));
  const [scroll, setScroll] = useState({ top: 0, height: 0, show: false });
  const selected = options.find((o) => o.id === value) ?? options[0];

  function syncScroll() {
    const el = menuRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 1) {
      setScroll({ top: 0, height: 0, show: false });
      return;
    }
    const track = Math.max(0, clientHeight - 16);
    const height = Math.max(24, (clientHeight / scrollHeight) * track);
    const top = (scrollTop / (scrollHeight - clientHeight)) * (track - height);
    setScroll({ top, height, show: true });
  }

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((o) => o.id === value)));

    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    const frame = requestAnimationFrame(syncScroll);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, options, value]);

  useEffect(() => {
    if (!open) return;
    const option = menuRef.current?.querySelectorAll<HTMLElement>(".dropdown-option")[active];
    option?.scrollIntoView({ block: "nearest" });
    syncScroll();
  }, [active, open]);

  function pick(idValue: T) {
    onChange(idValue);
    setOpen(false);
  }

  function onTriggerKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (!open && e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const option = options[active];
      if (option) pick(option.id);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    }
  }

  return (
    <div className={`dropdown ${open ? "open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className={`dropdown-trigger ${open ? "open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
      >
        <span>{selected?.label}</span>
        <span className="dropdown-chevron" aria-hidden />
      </button>
      {open && (
        <div className="dropdown-panel">
          <ul
            id={id}
            ref={menuRef}
            className="dropdown-menu"
            role="listbox"
            aria-label={ariaLabel}
            onScroll={syncScroll}
          >
            {options.map((option, i) => (
              <li key={option.id} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={option.id === value}
                  className={`dropdown-option ${option.id === value ? "selected" : ""} ${i === active ? "active" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(option.id)}
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
          {scroll.show && (
            <div className="dropdown-scroll" aria-hidden>
              <div
                className="dropdown-scroll-thumb"
                style={{ height: scroll.height, transform: `translateY(${scroll.top}px)` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
