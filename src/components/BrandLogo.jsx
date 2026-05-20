import React from 'react';

const logoSrc = `${import.meta.env.BASE_URL}assets/logo-langkangtong.png`;

export default function BrandLogo({ className = '', imageClassName = '' }) {
  const [failed, setFailed] = React.useState(false);

  if (failed) {
    return null;
  }

  return (
    <span className={`inline-flex items-center justify-center overflow-hidden rounded-full bg-white/80 ${className}`}>
      <img
        src={logoSrc}
        alt="ล้านก๋างโต้ง logo"
        className={`h-full w-full object-contain ${imageClassName}`}
        loading="eager"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
