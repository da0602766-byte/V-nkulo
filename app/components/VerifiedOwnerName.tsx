type VerifiedOwnerNameProps = {
  name: string;
  verified?: boolean;
  className?: string;
};

export default function VerifiedOwnerName({
  name,
  verified = false,
  className = "",
}: VerifiedOwnerNameProps) {
  return (
    <span className={`verified-owner-name ${className}`.trim()}>
      <span>{name}</span>
      {verified && (
        <span
          className="verified-owner-badge"
          title="Proprietário verificado"
          aria-label="Proprietário verificado"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m7.9 13.7-3.2-3.2 1.4-1.4 1.8 1.8 5.9-5.9 1.4 1.4-7.3 7.3Z" />
          </svg>
        </span>
      )}
    </span>
  );
}
