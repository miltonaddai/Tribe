import { CITIES, type CityId } from "@tribe/shared";
import type { Friend } from "../game/engine";

function cityName(id: string | null) {
  return id && CITIES[id as CityId] ? CITIES[id as CityId].shortName : null;
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
        <h4>Friends</h4>
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
              <button type="button" className="btn btn-outline inv-mini" onClick={() => onRemove(f.wallet)}>
                Remove
              </button>
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
                <button type="button" className="btn btn-outline inv-mini" onClick={() => onRemove(f.wallet)}>
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
