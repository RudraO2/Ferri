export function PocketLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect width="24" height="24" rx="6" fill="#18181b" />
      <path d="M6 15c3-6 9-6 12 0" stroke="#fafafa" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="12" cy="15" r="1.6" fill="#fafafa" />
    </svg>
  );
}
