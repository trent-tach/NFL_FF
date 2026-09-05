/* The public landing page. Routes are meant to stay thin: they compose
   sections and nothing else. Once features/home exists, the hero, stat strip
   and feature cards get imported here and this file barely grows. */

export default function HomePage() {
  return (
    <div>
      <h1 className="text-4xl font-bold tracking-tight">Fantasy Football</h1>
      <p className="mt-3 text-muted">
        Projections, player research, and matchup analysis.
      </p>
    </div>
  );
}
