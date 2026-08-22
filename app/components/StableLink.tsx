import type { AnchorHTMLAttributes, ReactNode } from "react";

export default function StableLink({
  href,
  children,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  children: ReactNode;
}) {
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
}
