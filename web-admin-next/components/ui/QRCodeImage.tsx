"use client";
import React, { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * QRCodeImage — client-side QR rendering.
 *
 * TAHAP 7 BUG #6 (P2-5):
 *   The previous implementation embedded <img src="https://api.qrserver.com/...">
 *   which leaked client identifiers (kode_klien / NRP) to a third-party
 *   server on every page render. We now render the QR locally with the
 *   `qrcode` npm package (toDataURL → embedded in a data: URI). The data
 *   never leaves the browser.
 *
 *   Note: only short, non-sensitive strings (NRP / kode_klien) should be
 *   encoded here. PINs, tokens, or anything else hashable must NOT be
 *   passed in — a QR is just an encoding, not an obscurity layer.
 */
interface QRCodeImageProps {
  data: string;
  size?: number;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function QRCodeImage({
  data,
  size = 150,
  alt = "QR Code",
  className,
  style,
}: QRCodeImageProps) {
  const [src, setSrc] = useState<string>("");
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setSrc("");
    if (!data) return;

    QRCode.toDataURL(data, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [data, size]);

  if (error) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          background: "var(--hover-row)",
          color: "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          borderRadius: 4,
          ...style,
        }}
      >
        QR error
      </div>
    );
  }

  if (!src) {
    return (
      <div
        className={`animate-pulse ${className || ""}`}
        style={{
          width: size,
          height: size,
          background: "var(--hover-row, #e5e7eb)",
          borderRadius: 4,
          ...style,
        }}
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={className}
      style={style}
    />
  );
}

export default QRCodeImage;