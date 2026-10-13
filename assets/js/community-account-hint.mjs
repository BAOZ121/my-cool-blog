/** Publish a short-lived visual hint only from the existing community Auth view.
 * Formal pages never read the Auth session or treat this hint as permission. */
export function bindCommunityAccountHint(auth, hints) {
  return auth.subscribe(state => {
    if (!state || state.error || state.recovery || ['signed_out', 'signing_out', 'disabled', 'disposed', 'recovery_ready', 'verification_required', 'password_updated'].includes(state.status)) {
      hints.clear(); return;
    }
    if (state.busy) return;
    if (state.status !== 'signed_in' || state.user?.emailVerified !== true || typeof state.user.email !== 'string') { hints.clear(); return; }
    const initials = state.user.email.split('@')[0].replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || 'ME';
    hints.write({ initials });
  });
}
