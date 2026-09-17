import { CITIES, type CityId } from "@tribe/shared";
import type { Friend } from "../game/engine";

function cityName(id: string | null) {
  return id && CITIES[id as CityId] ? CITIES[id as CityId].shortName : null;
}

/**
 * The dismiss control on a friend row.
 *
 * An icon rather than a worded button because the row already carries a name
 * and a location, and a third block of text made it the loudest thing in the
 * list - removing a friend is the rarest action here, not the main one. The
 * label survives for screen readers and as a tooltip, where it can say who is
 * being removed, which the X alone cannot.
 */
function DismissButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="friend-x" title={label} aria-label={label} onClick={onClick}>
      <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true" focusable="false">
        <path d="M1 1 L11 11 M11 1 L1 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export function FriendsTab({
  friends,
  onRespond,
  onRemove,
}: {
  friends: Friend[];
  onRespond: (wallet: string, accept: boolean) => void;
  onRemove: (wallet: string) => void;
}) {
  const incoming = friends.filter((f) => f.status === "incoming");
  const outgoing = friends.filter((f) => f.status === "outgoing");
  // Online first, so the people you can actually go and find are at the top.
  const accepted = friends
    .filter((f) => f.status === "friend")
    .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));

  return (
    <div className="friends-tab">
      {incoming.length > 0 && (
        <section>
          <h4>Requests</h4>
          <ul className="inbox-list">
            {incoming.map((f) => (
              <li key={f.wallet} className="inbox-item unread friend-row">
                <span className="friend-name">{f.name}</span>
                <span className="friend-actions">
                  <button type="button" className="btn btn-accent inv-mini" onClick={() => onRespond(f.wallet, true)}>
                    Accept
                  </button>
                  <button type="button" className="btn btn-outline inv-mini" onClick={() => onRespond(f.wallet, false)}>
                    Reject
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        {/* Counted only once you have any: "Friends (0)" over the line telling
            you how to make one is a worse way of saying the same thing. */}
        <h4>Friends{accepted.length > 0 ? ` (${accepted.length})` : ""}</h4>
        {accepted.length === 0 && (
          <p className="inbox-empty">Nobody yet. Stand next to a citizen and press G to ask.</p>
        )}
        <ul className="inbox-list">
          {accepted.map((f) => (
            <li key={f.wallet} className="inbox-item friend-row">
              <span className="friend-name">
                <span className={`friend-dot ${f.online ? "on" : ""}`} aria-hidden />
                {f.name}
              </span>
              <span className="friend-where">
                {f.online ? (cityName(f.city) ?? "online") : "offline"}
              </span>
              <DismissButton label={`Remove ${f.name}`} onClick={() => onRemove(f.wallet)} />
            </li>
          ))}
        </ul>
      </section>

      {outgoing.length > 0 && (
        <section>
          <h4>Sent</h4>
          <ul className="inbox-list">
            {outgoing.map((f) => (
              <li key={f.wallet} className="inbox-item friend-row">
                <span className="friend-name">{f.name}</span>
                <span className="friend-where">waiting</span>
                <DismissButton label={`Cancel request to ${f.name}`} onClick={() => onRemove(f.wallet)} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
