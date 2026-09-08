// Headshot <img> with a fallback: the photo join isn't 100% (undrafted
// rookies mostly), and a broken external CDN link shouldn't blank the row.

const PLACEHOLDER = "/player-placeholder.svg";

export default function PlayerPhoto({
  src,
  alt,
  size = 40,
}: {
  src: string;
  alt: string;
  size?: number;
}) {
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className="rounded-full object-cover bg-border"
      style={{ width: size, height: size }}
      onError={(e) => {
        const img = e.currentTarget;
        if (img.src !== window.location.origin + PLACEHOLDER) {
          img.src = PLACEHOLDER;
        }
      }}
    />
  );
}
