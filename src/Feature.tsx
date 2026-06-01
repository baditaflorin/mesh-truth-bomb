import { useEffect, useMemo, useState } from "react";
import {
  createClockSync,
  useDraft,
  useEventLog,
  useExpiringClaim,
  useFairRng,
  useFlashOnChange,
  useMeshSlot,
  useNamedPeer,
  useReactions,
  type MeshConfig,
  type YRoom,
} from "@baditaflorin/mesh-common";

type Props = { room: YRoom | null; config: MeshConfig };

type Q = { id: string; peerId: string; text: string; ts: number };

const CLAIM_MS = 5 * 60_000;
const KINDS = [
  { kind: "fire", emoji: "🔥", cls: "tb-fire", label: "react fire" },
  { kind: "hundred", emoji: "💯", cls: "tb-hundred", label: "react hundred" },
  { kind: "grimace", emoji: "😬", cls: "tb-grimace", label: "react grimace" },
] as const;

export function Feature({ room, config }: Props) {
  if (!room)
    return (
      <div className="tb-screen">
        <h1>truth bomb</h1>
        <p className="tb-status">Connecting…</p>
      </div>
    );
  return <Body room={room} config={config} />;
}

function Body({ room, config }: { room: YRoom; config: MeshConfig }) {
  const { name, setName, nameOf } = useNamedPeer(config, room);
  useFairRng(room, "tb-salts");
  const clock = useMemo(() => createClockSync(room.provider), [room]);
  useEffect(() => () => clock.destroy(), [clock]);
  const slot = useMeshSlot(clock, CLAIM_MS);

  const claim = useExpiringClaim(room, "spotlight", CLAIM_MS);
  const qLog = useEventLog<Q>(room, "questions");
  const reactions = useReactions(room, "q-reactions");

  // state map
  const stateMap = room.doc.getMap<string>("state");
  const [, setStateTick] = useState(0);
  useEffect(() => {
    const cb = () => setStateTick((n) => n + 1);
    stateMap.observe(cb);
    return () => stateMap.unobserve(cb);
  }, [room, stateMap]);
  const currentQId = stateMap.get("currentQId") ?? "";

  // rotation fallback peer selection (deterministic via slotId among present peers)
  const present = Array.from(room.doc.getMap<string>("__mesh_names").keys());
  present.sort();
  const fallbackPeer = present.length ? present[slot.slotId % present.length] : null;
  const spotlightPeer = claim.claimedBy ?? fallbackPeer;
  const spotlightName = spotlightPeer
    ? (nameOf(spotlightPeer) ?? `peer-${spotlightPeer.slice(0, 6)}`)
    : "—";
  const isSpotlight = spotlightPeer === room.peerId;

  const draft = useDraft<string>(`${config.storagePrefix}:tb-draft`, "");

  const flash = useFlashOnChange(currentQId);

  const trimmedName = name.trim();
  const currentQ = qLog.events.find((q) => q.id === currentQId);
  const pending = qLog.events.filter((q) => q.id !== currentQId);

  const dropQ = async () => {
    if (!trimmedName) return;
    await draft.commit((text) => {
      const t = text.trim();
      if (!t) return false;
      qLog.push({
        id: Math.random().toString(36).slice(2, 12),
        peerId: room.peerId,
        text: t,
        ts: Date.now(),
      });
    });
  };

  const pick = (qid: string) => stateMap.set("currentQId", qid);
  const skip = () => stateMap.set("currentQId", "");

  const claimSec = Math.ceil(claim.msRemaining / 1000);
  const counts = currentQ ? reactions.countsFor(currentQ.id) : {};

  return (
    <div className="tb-screen">
      <header className="tb-header">
        <h1>truth bomb</h1>
        <p className="tb-status">
          spotlight: <strong>{spotlightName}</strong>
          {claim.claimedBy && ` · ${claimSec}s`}
          {!claim.claimedBy && fallbackPeer && " · rotating"}
        </p>
      </header>

      <input
        className="tb-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="your name"
        aria-label="your name"
        maxLength={32}
      />

      <p className="tb-howto">
        {isSpotlight
          ? "You're on the spot — pick a question below and answer it out loud."
          : "Drop an anonymous question, then react to the answer with 🔥💯😬."}
      </p>

      <button
        type="button"
        className="tb-claim"
        aria-label="claim spotlight"
        onClick={claim.claim}
        disabled={!!claim.claimedBy && !claim.isMine}
      >
        {claim.isMine ? "you have the spotlight" : "claim spotlight"}
      </button>

      <section className={`tb-current ${flash ? "is-flash" : ""}`}>
        {currentQ ? (
          <>
            <p className="tb-current-text">{currentQ.text}</p>
            <p className="tb-current-meta">for {spotlightName}</p>
            <div className="tb-react-row">
              {KINDS.map((k) => (
                <button
                  key={k.kind}
                  type="button"
                  className={k.cls}
                  aria-label={k.label}
                  onClick={() => reactions.toggle(currentQ.id, k.kind)}
                >
                  {k.emoji} {counts[k.kind] ?? 0}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="tb-current-empty">no question yet — pick one or wait for one</p>
        )}
      </section>

      {isSpotlight ? (
        <section className="tb-pending">
          <h2>pending ({pending.length})</h2>
          {pending.length === 0 && <p className="tb-empty">no questions yet</p>}
          <ul className="tb-list">
            {pending.map((q) => (
              <li key={q.id} className="tb-row">
                <span className="tb-row-text">{q.text}</span>
                <button
                  type="button"
                  className="tb-pick"
                  aria-label="pick question"
                  onClick={() => pick(q.id)}
                >
                  pick
                </button>
              </li>
            ))}
          </ul>
          {currentQId && (
            <button type="button" className="tb-skip" onClick={skip}>
              skip
            </button>
          )}
        </section>
      ) : (
        <section className="tb-drop-zone">
          <textarea
            className="tb-textarea"
            value={draft.value}
            onChange={(e) => draft.setValue(e.target.value)}
            placeholder="ask anonymously"
            rows={3}
            maxLength={280}
            disabled={!trimmedName}
          />
          <button
            type="button"
            className="tb-drop"
            aria-label="drop Q"
            onClick={dropQ}
            disabled={!trimmedName || !draft.value.trim()}
          >
            drop Q
          </button>
        </section>
      )}
    </div>
  );
}
