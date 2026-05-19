import { Link } from 'react-router-dom';

export default function AdminMessagesPlaceholder({ conversationHintCount }: { conversationHintCount?: number }) {
  return (
    <section className="admin-section admin-section--dim" id="section-messages">
      <div className="admin-section-header">
        <h2>Messages &amp; Conversations</h2>
        <span className="admin-section-badge">Coming later</span>
      </div>
      <p className="admin-section-intro">
        Central messaging lives at <Link to="/messages">/messages</Link>. Admin moderation, transcript review, and
        flagged-thread workflows are not built yet — participants use buyer/creator dashboards today.
      </p>
      {typeof conversationHintCount === 'number' && conversationHintCount > 0 ?
        (
          <p className="subtle">
            Approx. {conversationHintCount} active request application thread{conversationHintCount !== 1 ? 's' : ''} may
            exist (refresh-only inbox).
          </p>
        )
      : (
        <p className="subtle">No conversation count loaded — open Messages as a logged-in buyer or creator to test threads.</p>
      )}
    </section>
  );
}
