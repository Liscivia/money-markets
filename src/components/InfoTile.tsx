import { CircleHelp, X } from 'lucide-react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

/** Hover/focus for discovery, click/tap to retain, Escape/outside click to dismiss. */
export default function InfoTile({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(360, window.innerWidth - 32);
      const below = window.innerHeight - rect.bottom - 16;
      const above = rect.top - 16;
      const upwards = below < 260 && above > below;
      setPosition({
        position: 'fixed',
        width,
        left: Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16)),
        top: upwards ? 'auto' : rect.bottom,
        bottom: upwards ? window.innerHeight - rect.top : 'auto',
        right: 'auto',
        maxHeight: Math.max(100, upwards ? above : below),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (root.current?.contains(document.activeElement)) trigger.current?.focus();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return (
    <div
      className="info-tile-anchor"
      ref={root}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!root.current?.contains(document.activeElement)) setOpen(false);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="info-tile-trigger"
        aria-label={`${title}: definition and methodology`}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="dialog"
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
      >
        <CircleHelp size={16} />
      </button>
      <div
        className="info-tile"
        style={position}
        id={id}
        role="dialog"
        aria-label={`${title} methodology`}
        hidden={!open}
      >
        <div className="info-tile-heading">
          <strong>{title}</strong>
          <button
            type="button"
            className="icon-button"
            aria-label={`Close ${title} explanation`}
            onClick={() => {
              trigger.current?.focus();
              setOpen(false);
            }}
          >
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
