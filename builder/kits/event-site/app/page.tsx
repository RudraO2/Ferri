import Image from "next/image";
import Link from "next/link";
import { capacity, event, isPlaceholder } from "@/lib/event";
import { hasLook, look } from "@/lib/look";

/** A fact, with a placeholder the Builder could not fill shown as such. */
function T({ v }: { v: string }) {
  return isPlaceholder(v) ? <span className="ph">{v}</span> : <>{v}</>;
}

export default function Home() {
  const e = event;
  // The poster's background (its art or the community photo) behind the hero, over the poster's own gradient.
  const art = hasLook ? (look.hero ?? null) : null;
  return (
    <>
      <section className={art ? "hero has-art" : "hero"} style={art ? { ["--hero-bg" as string]: art.background } : undefined}>
        {art?.image ? <Image className="hero-art" src={art.image} alt="" fill preload sizes="100vw" /> : null}
        <div className="wrap">
          <div className="eyebrow">
            <T v={e.community} />
          </div>
          <h1>
            <T v={e.name} />
          </h1>
          <p className="lead">
            <T v={e.tagline} />
          </p>
          <div className="facts">
            <div className="fact">
              <b>When</b>
              <T v={e.dates} />
              <div className="muted">
                <T v={e.timeLine} />
              </div>
            </div>
            <div className="fact">
              <b>Where</b>
              <T v={e.venue.name} />
              <div className="muted">
                <T v={e.venue.address} />
                {e.venue.mapUrl ? (
                  <>
                    {" "}
                    · <a href={e.venue.mapUrl}>Map</a>
                  </>
                ) : null}
              </div>
            </div>
            <div className="fact">
              <b>Registration</b>
              {e.registration.open ? "Open" : "Closed"}
              {e.registration.closes ? <div className="muted">Closes <T v={e.registration.closes} /></div> : null}
              {capacity !== null ? <div className="muted">{capacity} spots, then a waitlist</div> : null}
            </div>
          </div>
          {e.registration.open ? (
            <Link className="btn" href="/register">
              Register now
            </Link>
          ) : null}
          {e.registration.note ? <p className="muted" style={{ marginTop: 12 }}>{e.registration.note}</p> : null}
        </div>
      </section>

      <section className="block">
        <div className="wrap">
          <h2>What it is</h2>
          {e.about.map((p, i) => (
            <p key={i}>
              <T v={p} />
            </p>
          ))}
          {e.whoCanJoin ? (
            <p>
              <b>Who can join: </b>
              {e.whoCanJoin}
            </p>
          ) : null}
          {e.venue.notes ? <p className="muted">{e.venue.notes}</p> : null}
        </div>
      </section>

      <section className="block" id="schedule">
        <div className="wrap">
          <h2>Schedule</h2>
          {e.schedule.map((d) => (
            <div className="day" key={d.day}>
              <h3>
                <T v={d.day} />
              </h3>
              {d.items.map((it, i) => (
                <div className="item" key={i}>
                  <time>
                    <T v={it.time} />
                  </time>
                  <span>
                    <T v={it.what} />
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {e.sponsors.length ? (
        <section className="block">
          <div className="wrap">
            <h2>Sponsors</h2>
            <div className="grid2">
              {e.sponsors.map((s) => (
                <div className="card" key={s.name}>
                  <h3>{s.name}</h3>
                  <p className="muted">{s.offer}</p>
                </div>
              ))}
            </div>
            <p className="muted" style={{ marginTop: 16 }}>
              Registered participants can claim sponsor credits from <Link href="/me">their registration page</Link>.
            </p>
          </div>
        </section>
      ) : null}

      {e.rules.length ? (
        <section className="block">
          <div className="wrap">
            <h2>Rules</h2>
            <ul>
              {e.rules.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {e.faq.length ? (
        <section className="block" id="faq">
          <div className="wrap">
            <h2>FAQ</h2>
            {e.faq.map((f, i) => (
              <details key={i}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
