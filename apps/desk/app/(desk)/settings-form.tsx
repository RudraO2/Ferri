import { ChevronRight } from "lucide-react";
import { ago } from "@/lib/data";
import { LEVEL_LABEL, settingRows, type SettingRow, type SettingsLevelName } from "@/lib/settings";
import { DEFAULT_SETTINGS, TONE_PRESETS, showValue } from "@/lib/ferri";
import { resetSetting, saveSettings } from "./settings-actions";

/**
 * Customization (spec 21): every setting of one level, its default or
 * inherited value, who changed it, and a reset per key. The citation check,
 * the cards and the pause are not settings: they stay in code.
 *
 * Ferri's voice (tone, language) shows first; the timing and automation
 * settings fold away behind "More settings" (they are rarely changed). Folded
 * fields are still inside the form, so one Save sends them all.
 */

/** The settings people change most; everything else is folded. */
const VOICE_KEYS = new Set(["tone", "language"]);

const resetBtn = "h-7 rounded-full px-2.5 text-[12px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900";

function Field({ row, id }: { row: SettingRow; id?: string }) {
  const { info } = row;
  const name = `s_${info.key}`;
  const inherit = `${showValue(info.key, row.inherited.value)} (${LEVEL_LABEL[row.inherited.from]})`;
  if (info.type === "bool" || info.type === "choice") {
    const options = info.type === "bool" ? ["on", "off"] : info.choices!;
    const own = row.own === undefined ? "__inherit" : typeof row.own === "boolean" ? (row.own ? "on" : "off") : String(row.own);
    return (
      <select id={id} className="input" name={name} defaultValue={own} aria-label={id ? undefined : info.label}>
        <option value="__inherit">Inherit: {inherit}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      id={id}
      aria-label={id ? undefined : info.label}
      className="input"
      name={name}
      type={info.type === "number" ? "number" : "text"}
      min={info.min}
      max={info.max}
      list={info.key === "tone" ? "tone-presets" : undefined}
      defaultValue={row.own === undefined ? "" : String(row.own)}
      placeholder={`Inherit: ${inherit}`}
    />
  );
}

/** Tone and language for one attached space, in a single row (the Spaces page). */
export async function SpaceVoiceForm({ communityId, eventId, spaceId }: { communityId: string; eventId: string; spaceId: string }) {
  const rows = await settingRows("space", { communityId, eventId, spaceId });
  return (
    <form action={saveSettings} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="level" value="space" />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="back" value="/spaces" />
      {rows.map((row) => (
        <div key={row.info.key} className="min-w-0 flex-1 basis-[170px]">
          <label className="label" htmlFor={`${spaceId}-${row.info.key}`}>
            {row.info.label}
          </label>
          <div className="flex items-center gap-1">
            <Field row={row} id={`${spaceId}-${row.info.key}`} />
            {row.own !== undefined ? (
              <button className={resetBtn} formAction={resetSetting} name="resetKey" value={row.info.key} title={row.by ? `set by ${row.by.by}` : undefined} aria-label={`Reset ${row.info.label}`}>
                Reset
              </button>
            ) : null}
          </div>
        </div>
      ))}
      <button className="btn">Save</button>
    </form>
  );
}

function Row({ row, idPrefix }: { row: SettingRow; idPrefix: string }) {
  const id = `${idPrefix}-${row.info.key}`;
  return (
    <div className="grid gap-2 px-4 py-3 sm:grid-cols-12 sm:items-center sm:gap-3">
      <div className="sm:col-span-6">
        <label htmlFor={id} className="text-[13.5px] font-medium text-zinc-900">
          {row.info.label}
        </label>
        <div className="text-[12px] leading-relaxed text-zinc-500">
          {row.info.help} Default: {showValue(row.info.key, DEFAULT_SETTINGS[row.info.key])}.
        </div>
      </div>
      <div className="sm:col-span-4">
        <Field row={row} id={id} />
      </div>
      <div className="flex items-center gap-2 text-[12px] text-zinc-500 sm:col-span-2 sm:justify-end">
        {row.own !== undefined ? (
          <>
            <span className="truncate" title={row.by ? `set by ${row.by.by}${row.by.at ? ` ${ago(new Date(row.by.at))}` : ""}` : "set here"}>
              {row.by ? row.by.by : "set here"}
            </span>
            <button className={resetBtn} formAction={resetSetting} name="resetKey" value={row.info.key} aria-label={`Reset ${row.info.label}`}>
              Reset
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export async function SettingsForm({
  level,
  scope,
  back,
  title,
}: {
  level: SettingsLevelName;
  scope: { communityId: string; eventId?: string | null; spaceId?: string | null };
  back: string;
  title?: string;
}) {
  const rows = await settingRows(level, scope);
  const voice = rows.filter((r) => VOICE_KEYS.has(r.info.key));
  const more = rows.filter((r) => !VOICE_KEYS.has(r.info.key));
  const changed = more.filter((r) => r.own !== undefined).length;
  const idPrefix = `set-${level}`;
  return (
    <form action={saveSettings} className="card-flat">
      <input type="hidden" name="level" value={level} />
      <input type="hidden" name="eventId" value={scope.eventId ?? ""} />
      <input type="hidden" name="spaceId" value={scope.spaceId ?? ""} />
      <input type="hidden" name="back" value={back} />
      <datalist id="tone-presets">
        {Object.keys(TONE_PRESETS).map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      {title ? <div className="px-4 pt-3 text-[12px] text-zinc-500">{title}</div> : null}
      <div className="divide-y divide-zinc-100">
        {voice.map((row) => (
          <Row key={row.info.key} row={row} idPrefix={idPrefix} />
        ))}
      </div>
      {more.length ? (
        <details className="group border-t border-zinc-100">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] font-medium text-zinc-600 hover:text-zinc-900 [&::-webkit-details-marker]:hidden">
            <ChevronRight size={15} className="text-zinc-400 transition group-open:rotate-90" aria-hidden />
            More settings
            <span className="text-[12px] font-normal text-zinc-500">
              timing, care, guests, wrap{changed ? ` · ${changed} changed here` : ""}
            </span>
          </summary>
          <div className="divide-y divide-zinc-100 border-t border-zinc-100">
            {more.map((row) => (
              <Row key={row.info.key} row={row} idPrefix={idPrefix} />
            ))}
          </div>
        </details>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 px-4 py-3">
        <span className="text-[12px] text-zinc-500">Blank or Inherit uses the level above. No restart needed.</span>
        <button className="btn-primary">Save settings</button>
      </div>
    </form>
  );
}
