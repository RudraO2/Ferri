import Image from "next/image";
import Link from "next/link";
import { capacity, event, isPlaceholder } from "@/lib/event";
import { hasLook, look } from "@/lib/look";

/** A fact, with a placeholder the Builder could not fill shown as such. */
function T({ v }: { v: string }) {
  return isPlaceholder(v) ? <span className="ph">{v}</span> : <>{v}</>;
}

/** Small line icons in the text colour. Icons are drawn, never emoji. */
const ICONS = {
  calendar: "M4 5.5h16a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1ZM3 10h18M8 3v4M16 3v4",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 2",
  pin: "M12 21s-7-6.1-7-11.3a7 7 0 0 1 14 0C19 14.9 12 21 12 21ZM12 12.2a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  map: "M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4ZM9 4v13.5M15 6.5V20",
};
function Icon({ name, size = 18 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export default function Home() {
  const e = event;
  const open = e.registration.open;
  // The poster's art (or community photo) is an accent: a framed duotone panel beside the title, never a backdrop for text.
  const art = hasLook ? (look.hero?.image ?? null) : null;
  return (
    <>
      <section className={art ? "hero has-art" : "hero"} aria-labelledby="event-name">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="presenter">
              <T v={e.community} /> presents
            </p>
            <h1 id="event-name">
              <T v={e.name} />
            </h1>
            <p className="lead">
              <T v={e.tagline} />
            </p>
            <ul className="chips" aria-label="When and where">
              <li className="chip">
                <Icon name="calendar" />
                <span>
                  <T v={e.dates} />
                </span>
              </li>
              <li className="chip">
                <Icon name="clock" />
                <span>
                  <T v={e.timeLine} />
                </span>
              </li>
              <li className="chip">
                <Icon name="pin" />
                <span>
                  <T v={e.venue.name} />
                </span>
              </li>
            </ul>
            <div className="actions">
              {open ? (
                <Link className="btn btn-lg" href="/register">
                  Register
                </Link>
              ) : (
                <span className="status">Registration is closed</span>
              )}
              <Link className="btn btn-lg quiet" href="/#schedule">
                See the schedule
              </Link>
            </div>
            {(open && e.registration.closes) || capacity !== null ? (
              <p className="fine">
                {open && e.registration.closes ? (
                  <>
                    Registration closes <T v={e.registration.closes} />.{" "}
                  </>
                ) : null}
                {capacity !== null ? <>{capacity} spots, then a waitlist.</> : null}
              </p>
            ) : null}
          </div>
          {art ? (
            <figure className="art">
              <Image className="art-img" src={art} alt="" fill preload sizes="(min-width: 960px) 720px, 150vw" />
            </figure>
          ) : null}
        </div>
      </section>

      <section className="section" id="about" aria-labelledby="about-title">
        <div className="wrap split">
          <div className="section-head">
            <h2 id="about-title">About the event</h2>
          </div>
          <div className="prose">
            {e.about.map((p, i) => (
              <p key={i}>
                <T v={p} />
              </p>
            ))}
            {e.whoCanJoin ? (
              <div className="callout">
                <h3>Who can join</h3>
                <p>
                  <T v={e.whoCanJoin} />
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="section band" id="schedule" aria-labelledby="schedule-title">
        <div className="wrap">
          <div className="section-head wide">
            <h2 id="schedule-title">Schedule</h2>
            <p>
              <T v={e.dates} />. <T v={e.timeLine} />.
            </p>
          </div>
          <div className="days">
            {e.schedule.map((d) => (
              <div className="day" key={d.day}>
                <h3>
                  <T v={d.day} />
                </h3>
                <ol className="agenda">
                  {d.items.map((it, i) => (
                    <li key={i}>
                      <time>
                        <T v={it.time} />
                      </time>
                      <span>
                        <T v={it.what} />
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      </section>

      {e.sponsors.length ? (
        <section className="section" id="sponsors" aria-labelledby="sponsors-title">
          <div className="wrap split">
            <div className="section-head">
              <h2 id="sponsors-title">Sponsors</h2>
              <p>
                Registered participants claim sponsor credits from <Link href="/me">their registration page</Link>.
              </p>
            </div>
            <ul className="sponsors">
              {e.sponsors.map((s) => (
                <li key={s.name}>
                  <span className="sponsor-name">
                    <T v={s.name} />
                  </span>
                  <span className="muted">
                    <T v={s.offer} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="section" id="venue" aria-labelledby="venue-title">
        <div className="wrap split">
          <div className="section-head">
            <h2 id="venue-title">Venue</h2>
          </div>
          <div className="venue">
            <div className="venue-card">
              <span className="venue-icon">
                <Icon name="pin" size={22} />
              </span>
              <p className="venue-name">
                <T v={e.venue.name} />
              </p>
              <p className="venue-address">
                <T v={e.venue.address} />
              </p>
              {e.venue.mapUrl ? (
                <a className="btn quiet" href={e.venue.mapUrl}>
                  <Icon name="map" />
                  Open in maps
                </a>
              ) : null}
            </div>
            <dl className="details">
              <div>
                <dt>When</dt>
                <dd>
                  <T v={e.dates} />
                  <br />
                  <span className="muted">
                    <T v={e.timeLine} />
                  </span>
                </dd>
              </div>
              {e.venue.notes ? (
                <div>
                  <dt>Good to know</dt>
                  <dd>
                    <T v={e.venue.notes} />
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>
      </section>

      {e.rules.length ? (
        <section className="section" id="rules" aria-labelledby="rules-title">
          <div className="wrap split">
            <div className="section-head">
              <h2 id="rules-title">Rules</h2>
            </div>
            <ul className="rules">
              {e.rules.map((r, i) => (
                <li key={i}>
                  <T v={r} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {e.faq.length ? (
        <section className="section" id="faq" aria-labelledby="faq-title">
          <div className="wrap split">
            <div className="section-head">
              <h2 id="faq-title">FAQ</h2>
              <p>
                <T v={e.contact.text} />
                {e.contact.email ? (
                  <>
                    {" "}
                    <a href={`mailto:${e.contact.email}`}>{e.contact.email}</a>
                  </>
                ) : null}
              </p>
            </div>
            <div className="faq">
              {e.faq.map((f, i) => (
                <details key={i}>
                  <summary>
                    <span>
                      <T v={f.q} />
                    </span>
                    <span className="pm" aria-hidden="true" />
                  </summary>
                  <div className="answer">
                    <p>
                      <T v={f.a} />
                    </p>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="cta" aria-labelledby="cta-title">
        <div className="wrap">
          <div className="cta-inner">
            <div>
              <h2 id="cta-title">
                {open ? (
                  <>
                    Register for <T v={e.name} />
                  </>
                ) : (
                  "Registration is closed"
                )}
              </h2>
              <p>
                <T v={e.dates} />, <T v={e.venue.name} />.
                {e.registration.note ? (
                  <>
                    {" "}
                    <T v={e.registration.note} />
                  </>
                ) : null}
              </p>
            </div>
            {open ? (
              <Link className="btn btn-lg" href="/register">
                Register
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}
