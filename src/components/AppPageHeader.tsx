import './AppPageHeader.css';

export default function AppPageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="app-page-header">
      <div className="container app-page-header-inner">
        {eyebrow ?
          <div className="app-page-eyebrow">{eyebrow}</div>
        : null}
        <div className="app-page-header-row">
          <div>
            <h1 className="app-page-title">{title}</h1>
            {subtitle ?
              <p className="app-page-sub">{subtitle}</p>
            : null}
          </div>
          {actions ?
            <div className="app-page-actions">{actions}</div>
          : null}
        </div>
      </div>
    </header>
  );
}
