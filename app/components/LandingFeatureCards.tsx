"use client";

import { useState } from "react";
import PublicIcon, { type PublicIconName } from "./PublicIcon";

export type LandingFeature = readonly [
  PublicIconName,
  string,
  string,
  string,
  string,
];

export default function LandingFeatureCards({
  features,
}: {
  features: readonly LandingFeature[];
}) {
  const [selected, setSelected] = useState<LandingFeature | null>(null);

  return (
    <>
      <div>
        {features.map((feature) => {
          const [icon, title, description] = feature;
          return (
            <article key={title}>
              <button type="button" onClick={() => setSelected(feature)}>
                <span><PublicIcon name={icon} size={21} /></span>
                <h3>{title}</h3>
                <p>{description}</p>
                <i aria-hidden="true"><PublicIcon name="arrow" size={17} /></i>
              </button>
            </article>
          );
        })}
      </div>

      {selected && (
        <div className="landing-feature-backdrop" role="presentation" onClick={() => setSelected(null)}>
          <section
            className="landing-feature-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="landing-feature-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="landing-feature-close" onClick={() => setSelected(null)} aria-label="Fechar">×</button>
            <span><PublicIcon name={selected[0]} size={24} /></span>
            <p className="landing-eyebrow">CONHEÇA O RECURSO</p>
            <h2 id="landing-feature-title">{selected[1]}</h2>
            <p>{selected[4]}</p>
          </section>
        </div>
      )}
    </>
  );
}
