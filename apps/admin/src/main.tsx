import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GAME_NAME } from '@alexioncity/shared';

/**
 * Placeholder. The real admin app arrives with Phase 2 (moderation) and Phase 6 (economy, events, ads):
 * its own domain, role-based access, two-factor sign-in, an audit log, and second-person approval
 * for risky actions. Until then it shows nothing and offers no actions.
 */
function App() {
  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 560,
        margin: '4rem auto',
        padding: '0 1rem',
      }}
    >
      <h1>{GAME_NAME} Admin</h1>
      <p>
        This app is not set up yet. Sign-in, roles and audit logging come first, before any admin
        tool exists.
      </p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
