/* The brand mark, isolated so every size and placement decision lives in
   one file.

   The artwork is a 2.39:1 horizontal lockup (football + wordmark + horse),
   so it is sized by height and left to find its own width -- constraining
   the width instead is what squashes a lockup like this. Its own dark
   shading is drawn to sit on a near-black ground, which is why the header
   and footer slabs are dark rather than brand-colored. */

const HEIGHTS = {
  sm: "h-8", // 32px -- menu sheet
  md: "h-11", // 44px -- header slab, inside a 64px bar
  lg: "h-16", // 64px -- footer / large surfaces
} as const;

export default function Wordmark({
  size = "md",
  className = "",
}: {
  size?: keyof typeof HEIGHTS;
  className?: string;
}) {
  return (
    <img
      src="/workhorse-logo.svg"
      alt="Workhorse"
      className={`${HEIGHTS[size]} w-auto ${className}`}
    />
  );
}
