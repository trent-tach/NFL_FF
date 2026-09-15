/* The URL-to-page map for the entire app. This is the closest thing you have
   to a table of @RequestMapping entries, and adding a page means adding a
   line here rather than touching anything else.

   The outer Route has no path on purpose. That makes it a "layout route": it
   matches nothing by itself, it just wraps every child in PublicLayout. */

import { Routes, Route } from "react-router-dom";
import PublicLayout from "@/layouts/PublicLayout";
import HomePage from "@/routes/public/HomePage";
import RedraftRankingsPage from "@/routes/public/RedraftRankingsPage";
import DynastyRankingsPage from "@/routes/public/DynastyRankingsPage";
import PlayerPage from "@/routes/public/PlayerPage";
import StartSitPage from "@/routes/public/StartSitPage";
import GamesPage from "@/routes/public/GamesPage";
import MyLeaguesPage from "@/routes/public/MyLeaguesPage";
import MyMatchupsPage from "@/routes/public/MyMatchupsPage";
import NotFoundPage from "@/routes/public/NotFoundPage";

export default function Router() {
  return (
    <Routes>
      {/* Public group, no login required. When auth arrives, the private
          pages become a sibling block down here using AppLayout. */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/redraft" element={<RedraftRankingsPage />} />
        <Route path="/dynasty" element={<DynastyRankingsPage />} />
        <Route path="/players/:slug" element={<PlayerPage />} />
        <Route path="/tools/start-sit" element={<StartSitPage />} />
        <Route path="/games" element={<GamesPage />} />
        <Route path="/my-leagues" element={<MyLeaguesPage />} />
        <Route path="/my-matchups" element={<MyMatchupsPage />} />

        {/* Catch-all. Without it, a typo'd URL renders a blank white page
            and no error, which is a genuinely confusing ten minutes. */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
