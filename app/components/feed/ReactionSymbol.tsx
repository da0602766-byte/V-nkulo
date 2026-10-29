/** Small, original interface marks for Vínkulo's four existing reactions. */
export default function ReactionSymbol({ type }: { type: string }) {
  return <span className="vinkulo-reaction-symbol" data-symbol={type} aria-hidden="true">
    <svg viewBox="0 0 32 32" fill="none" focusable="false">
      {type === "AMEM" ? <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m7 25 5-6 2-11c.3-2 2-2 2 0v13l-5 6M25 25l-5-6-2-11c-.3-2-2-2-2 0v13l5 6" />
        <path d="m5 22 6 5m16-5-6 5M8 9 6 7m18 2 2-2M16 2v2" />
      </g> : type === "CORACAO" ? <>
        <path d="M16 26S5 20 5 12.5C5 6 13 4.5 16 10c3-5.5 11-4 11 2.5C27 20 16 26 16 26Z" fill="currentColor" />
        <path d="m22 4 1-2m4 6 2-1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </> : type === "ORACAO" ? <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 5c-1 7-4 10-10 11 6 1 9 4 10 11 1-7 4-10 10-11-6-1-9-4-10-11Z" fill="currentColor" fillOpacity=".3" />
        <path d="M16 11v10m-5-5h10M6 5v4M4 7h4m18 16v4m-2-2h4" />
      </g> : <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M24 7a11 11 0 1 0 3 9" />
        <path d="M10 13h.01M20 13h.01M10 19c3 5 8 5 11 0" strokeWidth="2.6" />
        <path d="M26 3v6m-3-3h6" />
      </g>}
    </svg>
  </span>;
}
