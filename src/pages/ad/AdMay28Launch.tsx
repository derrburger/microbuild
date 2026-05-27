import './AdMay28Launch.css';

const BUSINESS_CARDS = [
  { icon: '💬', label: 'Quote Funnel' },
  { icon: '📅', label: 'Booking Page' },
  { icon: '⭐', label: 'Review Booster' },
  { icon: '🤖', label: 'AI Intake Form' },
] as const;

const CREATOR_CARDS = [
  { icon: '⚡', label: 'Automation Builder' },
  { icon: '🧩', label: 'No-Code Creator' },
  { icon: '🔀', label: 'Workflow Specialist' },
] as const;

const WORKFLOW_STEPS = [
  'Request',
  'Application',
  'Agreement',
  'Build',
  'Delivery',
] as const;

export default function AdMay28Launch() {
  return (
    <div className="ad-launch-page" aria-hidden="true">
      <div className="ad-launch-viewport">
        <div className="ad-launch-canvas">
          {/* Scene 1 */}
          <section className="ad-scene ad-scene--1" aria-hidden="true">
            <div className="ad-scene-inner ad-scene-inner--center">
              <div className="ad-logo-wrap ad-anim ad-anim--fade-scale">
                <span className="ad-logo-mark">MB</span>
                <h1 className="ad-logo-text">MicroBuild</h1>
              </div>
              <p className="ad-headline ad-anim ad-anim--slide-up ad-anim--delay-1">
                Launching May 28
              </p>
              <div className="ad-accent-line ad-anim ad-anim--slide-up ad-anim--delay-2" />
            </div>
          </section>

          {/* Scene 2 */}
          <section className="ad-scene ad-scene--2" aria-hidden="true">
            <div className="ad-scene-inner">
              <h2 className="ad-scene-title ad-anim ad-anim--slide-up">
                Businesses request systems
              </h2>
              <div className="ad-card-grid ad-card-grid--2x2">
                {BUSINESS_CARDS.map((card, i) => (
                  <div
                    key={card.label}
                    className={`ad-card ad-anim ad-anim--card ad-anim--card-${i + 1}`}
                  >
                    <span className="ad-card-icon" aria-hidden="true">
                      {card.icon}
                    </span>
                    <span className="ad-card-label">{card.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Scene 3 */}
          <section className="ad-scene ad-scene--3" aria-hidden="true">
            <div className="ad-scene-inner">
              <h2 className="ad-scene-title ad-anim ad-anim--slide-up">
                Creators apply to build
              </h2>
              <div className="ad-card-grid ad-card-grid--3">
                {CREATOR_CARDS.map((card, i) => (
                  <div
                    key={card.label}
                    className={`ad-card ad-anim ad-anim--card ad-anim--card-${i + 1}`}
                  >
                    <span className="ad-card-icon" aria-hidden="true">
                      {card.icon}
                    </span>
                    <span className="ad-card-label">{card.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Scene 4 */}
          <section className="ad-scene ad-scene--4" aria-hidden="true">
            <div className="ad-scene-inner">
              <h2 className="ad-scene-title ad-anim ad-anim--slide-up">
                AI organizes the workflow
              </h2>
              <div className="ad-workflow">
                <div className="ad-workflow-track" aria-hidden="true">
                  <div className="ad-workflow-highlight" />
                </div>
                <div className="ad-workflow-steps">
                  {WORKFLOW_STEPS.map((step, i) => (
                    <div
                      key={step}
                      className={`ad-workflow-step ad-workflow-step--${i + 1}`}
                    >
                      <span className="ad-workflow-dot" />
                      <span className="ad-workflow-label">{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Scene 5 */}
          <section className="ad-scene ad-scene--5" aria-hidden="true">
            <div className="ad-scene-inner ad-scene-inner--center">
              <h2 className="ad-finale-title ad-anim ad-anim--fade-scale">
                MicroBuild launches May 28
              </h2>
              <p className="ad-finale-cta ad-anim ad-anim--slide-up ad-anim--delay-1">
                Follow before launch
              </p>
              <div className="ad-finale-badge ad-anim ad-anim--slide-up ad-anim--delay-2">
                @microbuild
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
