import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="text-4xl font-bold">This page doesn't exist</h1>
      <p className="mx-auto mt-3 max-w-md text-muted">
        The link may be out of date. Everything the site actually does is one of these:
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          to="/redraft"
          className="rounded-full bg-brand px-5 py-2.5 font-display text-[12px] font-bold uppercase tracking-[0.08em] text-on-brand transition-colors hover:bg-brand-strong"
        >
          Weekly rankings
        </Link>
        <Link
          to="/games"
          className="rounded-full border border-border-strong px-5 py-2.5 font-display text-[12px] font-bold uppercase tracking-[0.08em] transition-colors hover:bg-hover-tint"
        >
          Game picks
        </Link>
      </div>
    </div>
  );
}
