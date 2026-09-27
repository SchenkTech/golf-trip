import { useEffect, useState } from "react";
import { api } from "./api.ts";
import type { EventPhoto, EventSummary } from "./api.ts";
import { getDeviceIdentity, setDeviceIdentity, getStoredJoinCode, setStoredJoinCode } from "./lib/identity.ts";
import { downscaleImage } from "./lib/image.ts";
import { formatRelativeTime } from "./lib/format.ts";
import "./Photos.css";

const MAX_EDGE = 2400;

interface RosterPlayer {
  playerId: string;
  name: string;
}

/** Trip photos -- entirely optional, off by default (docs/DECISIONS.md
 *  #11): an admin turns event.photosEnabled on to make this screen and
 *  its More-menu link exist at all, and separately turns
 *  event.photosUploadEnabled on to actually accept new uploads, so last
 *  year's album can stay up to browse without staying open to new photos
 *  outside the trip itself. Viewing needs nothing; uploading needs the
 *  same join-code-plus-a-name docs/DECISIONS.md #6 already uses for
 *  scoring, reusing the exact same device identity (lib/identity.ts) --
 *  pick your name once here or on a match, and it sticks for both. */
export default function Photos() {
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [photos, setPhotos] = useState<EventPhoto[] | null>(null);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [me, setMe] = useState<string | null>(getDeviceIdentity());
  const [codeChecked, setCodeChecked] = useState(!!getStoredJoinCode());
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<EventPhoto | null>(null);

  useEffect(() => {
    api
      .currentEvent()
      .then((ev) => {
        setEvent(ev);
        if (!ev.photosEnabled) return;
        api
          .photos(ev.id)
          .then((r) => setPhotos(r.photos))
          .catch((e) => setError(String(e)));
        api
          .teams(ev.id)
          .then((r) => setRoster(r.teams.flatMap((t) => t.members.map((m) => ({ playerId: m.playerId, name: m.name })))))
          .catch(() => {}); // the name picker just shows nobody if this fails -- upload still works with a blank name
      })
      .catch((e) => setError(String(e)));
  }, []);

  if (error) {
    return (
      <main className="board">
        <p className="load-error">Couldn't load photos: {error}</p>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="board">
        <p className="loading">Loading…</p>
      </main>
    );
  }

  if (!event.photosEnabled) {
    return (
      <main className="board">
        <header className="page-header">
          <h1>Photos</h1>
        </header>
        <p className="page-sub">There's no photo album open for this trip right now.</p>
      </main>
    );
  }

  const submitCode = () => {
    setCheckingCode(true);
    setCodeError(null);
    api
      .verifyCode(event.id, codeInput.trim())
      .then((r) => {
        if (r.ok) {
          setStoredJoinCode(codeInput.trim());
          setCodeChecked(true);
        } else {
          setCodeError("That's not the code for this trip.");
        }
      })
      .catch(() => setCodeError("Couldn't check that right now -- try again."))
      .finally(() => setCheckingCode(false));
  };

  const upload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const resized = await downscaleImage(file, MAX_EDGE, 0.85);
      const name = roster.find((p) => p.playerId === me)?.name ?? null;
      const code = getStoredJoinCode();
      const photo = await api.uploadPhoto(event.id, resized, name, code);
      setPhotos((prev) => [photo, ...(prev ?? [])]);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="board photos-page">
      <header className="page-header">
        <h1>Photos</h1>
        <p className="page-sub">
          {photos === null
            ? "Loading…"
            : photos.length === 0
              ? "Nobody's added one yet."
              : `${photos.length} photo${photos.length === 1 ? "" : "s"} from the trip.`}
        </p>
      </header>

      {!event.photosUploadEnabled && <p className="photos-upload-closed">Uploads are closed right now.</p>}

      {event.photosUploadEnabled && event.requiresCode && !codeChecked && (
        <div className="photos-upload-gate">
          <p className="photos-upload-gate-hint">Enter the trip code to add photos.</p>
          <input
            className="code-input"
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && codeInput.trim() && submitCode()}
            placeholder="Trip code"
          />
          {codeError && <p className="code-error">{codeError}</p>}
          <button className="photos-upload-btn" disabled={!codeInput.trim() || checkingCode} onClick={submitCode}>
            {checkingCode ? "Checking…" : "Continue"}
          </button>
        </div>
      )}

      {event.photosUploadEnabled && (!event.requiresCode || codeChecked) && !me && (
        <div className="photos-upload-gate">
          <p className="photos-upload-gate-hint">Who are you?</p>
          <div className="photos-who-list">
            {roster.map((p) => (
              <button
                key={p.playerId}
                className="photos-who-option"
                onClick={() => {
                  setDeviceIdentity(p.playerId);
                  setMe(p.playerId);
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {event.photosUploadEnabled && (!event.requiresCode || codeChecked) && me && (
        <div className="photos-upload-row">
          <label className="photos-upload-btn">
            {uploading ? "Uploading…" : "Add a photo"}
            <input
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload(file);
                e.target.value = "";
              }}
            />
          </label>
          {uploadError && <p className="code-error">{uploadError}</p>}
        </div>
      )}

      {photos && photos.length > 0 && (
        <div className="photos-grid">
          {photos.map((p) => (
            <button key={p.id} className="photos-grid-cell" onClick={() => setLightbox(p)}>
              <img src={p.url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {lightbox && (
        <div className="photos-lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox.url} alt="" />
          <p className="photos-lightbox-caption">
            {lightbox.uploadedByName ?? "Someone"} · {formatRelativeTime(new Date(lightbox.createdAt).toISOString())}
          </p>
        </div>
      )}
    </main>
  );
}
