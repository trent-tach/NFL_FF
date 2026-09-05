/* Root component, and deliberately almost empty. main.tsx handles mounting,
   providers.tsx handles global context, and the router owns everything from
   here down. The backend health-check that used to live in this file is gone
   along with the rest of the scaffold. */

import Router from "@/app/router";

export default function App() {
  return <Router />;
}
