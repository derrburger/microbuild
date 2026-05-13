import { Link } from 'react-router-dom';
import './NotFound.css';

export default function NotFound() {
  return (
    <div className="notfound-page">
      <div className="container notfound-inner">
        <div className="notfound-code">404</div>
        <h1 className="notfound-title">Page not found</h1>
        <p className="notfound-sub">
          That page doesn't exist. It may have been moved, or the URL might be off.
        </p>
        <div className="notfound-actions">
          <Link to="/" className="btn btn-primary btn-lg">Go Home</Link>
          <Link to="/browse" className="btn btn-ghost btn-lg">Browse MicroBuilds</Link>
        </div>
      </div>
    </div>
  );
}
