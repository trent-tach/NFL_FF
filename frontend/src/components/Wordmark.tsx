/* The brand mark, isolated so renaming the product is a one-file edit.
   Every glyph decision -- face, weight, tracking, optical size -- lives
   here rather than being retyped at each call site. */

export default function Wordmark({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md";
  className?: string;
}) {
  // Archivo 800 is already dense; at display sizes it needs negative
  // tracking to stop the letters reading as two separate words.
  const sizeClasses = size === "sm" ? "text-[18px]" : "text-[26px]";

  return (
    <span
      className={`font-display font-extrabold leading-none tracking-[-0.05em] ${sizeClasses} ${className}`}
    >
      FF
    </span>
  );
}
