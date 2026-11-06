import { ago } from "@/lib/data";
import { LEVEL_LABEL, settingRows, type SettingRow, type SettingsLevelName } from "@/lib/settings";
import { DEFAULT_SETTINGS, TONE_PRESETS, showValue } from "@/lib/ferri";
import { resetSetting, saveSettings } from "./settings-actions";

/**
 * Customization (spec 21): every setting of one level, its default or
 * inherited value, who changed it, and a reset per key. The citation check,
 * the cards and the pause are not settings: they stay in code.
 */

function Field({ row }: { row: SettingRow }) {
  const { info } = row;
  const name = `s_${info.key}`;
  const inherit = `${showValue(info.key, row.inherited.value)} (${LEVEL_LABEL[row.inherited.from]})`;
  if (info.type === "bool" || info.type === "choice") {
    const options = info.type === "bool" ? ["on", "off"] : info.choices!;
    const own = row.own === undefined ? "__inherit" : typeof row.own === "boolean" ? (row.own ? "on" : "off") : String(row.own);
    return (
      <select className="input" name={name} defaultValue={own}>
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
    <form action={saveSettings} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="level" value="space" />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="back" value="/spaces" />
      {rows.map((row) => (
        <div key={row.info.key} className="flex items-center gap-1">
          <span className="text-[12px] text-zinc-500">{row.info.label}</span>
          <div className="w-[170px]">
            <Field row={row} />
          </div>
          {row.own !== undefined ? (
            <button className="btn" formAction={resetSetting} name="resetKey" value={row.info.key} title={row.by ? `set by ${row.by.by}` : undefined}>
              Reset
            </button>
          ) : null}
        </div>
      ))}
      <button className="btn">Save voice</button>
    </form>
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
  return (
    <form action={saveSettings} className="card divide-y divide-zinc-100">
      <input type="hidden" name="level" value={level} />
      <input type="hidden" name="eventId" value={scope.eventId ?? ""} />
      <input type="hidden" name="spaceId" value={scope.spaceId ?? ""} />
      <input type="hidden" name="back" value={back} />
      <datalist id="tone-presets">
        {Object.keys(TONE_PRESETS).map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      {title ? <div className="px-4 py-2.5 text-[12px] text-zinc-500">{title}</div> : null}
      {rows.map((row) => (
        <div key={row.info.key} className="grid grid-cols-12 items-center gap-3 px-4 py-2.5">
          <div className="col-span-5">
            <div className="text-[13px] font-medium">{row.info.label}</div>
            <div className="text-[12px] text-zinc-500">
              {row.info.help} Default: {showValue(row.info.key, DEFAULT_SETTINGS[row.info.key])}.
            </div>
          </div>
          <div className="col-span-4">
            <Field row={row} />
          </div>
          <div className="col-span-3 flex items-center justify-end gap-2 text-[12px] text-zinc-500">
            {row.own !== undefined ? (
              <>
                <span>
                  set{row.by ? ` by ${row.by.by}${row.by.at ? ` ${ago(new Date(row.by.at))}` : ""}` : " here"}
                </span>
                <button className="btn" formAction={resetSetting} name="resetKey" value={row.info.key}>
                  Reset
                </button>
              </>
            ) : (
              <span>
                uses {showValue(row.info.key, row.inherited.value)} ({LEVEL_LABEL[row.inherited.from]})
              </span>
            )}
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-[12px] text-zinc-500">Blank or Inherit uses the level above. Ferri reads these on its next message, no restart.</span>
        <button className="btn-primary">Save settings</button>
      </div>
    </form>
  );
}
