import type { AdminSectionId } from './adminSections';
import { ADMIN_SECTIONS } from './adminSections';

export default function AdminSectionTabs({
  active,
  onChange,
}: {
  active: AdminSectionId;
  onChange: (id: AdminSectionId) => void;
}) {
  return (
    <nav className="admin-section-tabs" aria-label="Admin sections">
      {ADMIN_SECTIONS.map((s) => (
        <button
          key={s.id}
          type="button"
          role="tab"
          aria-selected={active === s.id}
          className={`admin-section-tab${active === s.id ? ' active' : ''}`}
          onClick={() => onChange(s.id)}
          title={s.hint}
        >
          {s.label}
        </button>
      ))}
    </nav>
  );
}
