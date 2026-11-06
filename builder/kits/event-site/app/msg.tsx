export function Msg({ msg }: { msg?: string }) {
  return msg ? (
    <div className="msg" role="status">
      {msg}
    </div>
  ) : null;
}
