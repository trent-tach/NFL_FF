/* The URL-to-page map for the entire app. This is the closest thing you have
   to a table of @RequestMapping entries, and adding a page means adding a
   line here rather than touching anything else.

   The outer Route has no path on purpose. That makes it a "layout route": it
   matches nothing by itself, it just wraps every child in PublicLayout. */

import { Routes, Route } from "react-router-dom";
import PublicLayout from "@/layouts/PublicLayout";
import HomePage from "@/routes/public/HomePage";

export default function Router() {
  return (
    <Routes>
      {/* Public group, no login required. When auth arrives, the private
          pages become a sibling block down here using AppLayout. */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />

        {/* Catch-all. Without it, a typo'd URL renders a blank white page
            and no error, which is a genuinely confusing ten minutes. */}
        <Route path="*" element={<p>Page not found</p>} />
      </Route>
    </Routes>
  );
}
