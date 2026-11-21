import { useState } from "react";
import {
  agoLabel,
  OFFENCES,
  offenceLabel,
  REPORT_NOTE_MAX,
  type CrimeReport,
} from "@block/shared";

/**
 * The station blotter: file a report, and read what has been filed here in the
 * last 72 hours.
 *
 * Reading comes first in the layout, because most visits are to look rather
 * than to file. The form sits under it, collapsed until wanted, so walking in
 * does not present a stranger with an empty accusation box as the first thing
 * they see.
 *
 * Nothing here is presented as fact. Every entry is worded as an account by the
 * player who filed it - "doofus reported..." - because that is all it is: the
 * server stores the accused as the name shown at the time and never resolves it
 * to a wallet, and filing has no effect on anyone.
 */
export function CrimeBoard({
  reports,
  nearby,
  onFile,
  onClose,
}: {
  reports: CrimeReport[];
  nearby: string[];
  onFile: (offence: string, accused: string, note: string) => void;
  onClose: () => void;
}) {
  const [filing, setFiling] = useState(false);
  const [offence, setOffence] = useState<string>(OFFENCES[0].id);
  const [accused, setAccused] = useState("");
  const [note, setNote] = useState("");

  const submit = () => {
    onFile(offence, accused.trim(), note.trim());
    setFiling(false);
    setAccused("");
    setNote("");
    setOffence(OFFENCES[0].id);
  };

  return (
    <div className="crime-board">
      <header className="crime-head">
        <div>
          <h2>Police Station</h2>
          <p className="crime-sub">Incidents reported in this district, last 72 hours</p>
        </div>
        <button className="btn btn-ghost crime-x" type="button" onClick={onClose}>
          Close
        </button>
      </header>

      <ul className="crime-list">
        {reports.length === 0 && (
          <li className="crime-empty">Nothing on the board. The district has been quiet.</li>
        )}
        {reports.map((r) => (
          <li key={r.id} className="crime-item">
            <div className="crime-row">
              <span className="crime-offence">{offenceLabel(r.offence)}</span>
              <span className="crime-when">{agoLabel(r.at)}</span>
            </div>
            <p className="crime-who">
              {r.reporterName} reported
              {r.accusedName ? <> <strong>{r.accusedName}</strong></> : " an incident"}
            </p>
            {r.note && <p className="crime-note">“{r.note}”</p>}
          </li>
        ))}
      </ul>

      {!filing ? (
        <button className="btn btn-accent" type="button" onClick={() => setFiling(true)}>
          Report a crime
        </button>
      ) : (
        <form
          className="crime-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor="crime-offence">OFFENCE</label>
          <select
            id="crime-offence"
            className="select"
            value={offence}
            onChange={(e) => setOffence(e.target.value)}
          >
            {OFFENCES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>

          <label htmlFor="crime-accused">WHO (OPTIONAL)</label>
          {/* A datalist rather than a dropdown: the person may have walked off,
              and a list that only offered who is currently visible would make
              reporting them impossible. */}
          <input
            id="crime-accused"
            className="input"
            list="crime-nearby"
            maxLength={16}
            placeholder="Name, if you know it"
            value={accused}
            onChange={(e) => setAccused(e.target.value)}
          />
          <datalist id="crime-nearby">
            {nearby.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>

          <label htmlFor="crime-note">WHAT HAPPENED (OPTIONAL)</label>
          <input
            id="crime-note"
            className="input"
            maxLength={REPORT_NOTE_MAX}
            placeholder="e.g. jumped me outside the bank"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <span className="crime-count">
            {note.trim().length} / {REPORT_NOTE_MAX}
          </span>

          <p className="crime-fineprint">
            Reports are a public record for other citizens. They are not verified, and filing one
            does not penalise anyone.
          </p>

          <div className="list-actions">
            <button className="btn btn-accent" type="submit">
              File report
            </button>
            <button className="btn" type="button" onClick={() => setFiling(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
