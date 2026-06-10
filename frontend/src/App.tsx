import { lazy, Suspense } from "react";
import { LittleOrangeApp } from "./littleorange/LittleOrangeApp";

import "./styles/reset.css";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/glass.css";
import "./styles/panels.css";
import "./styles/chat.css";
import "./styles/overlays.css";
import "./styles/motion.css";
import "./styles/command-palette.css";
import "./styles/drawers.css";
import "./styles/canvas.css";
import "./styles/animations.css";
import "./styles/responsive.css";
import "./styles/visual-atlas.css";
import "./styles/littleorange.css";

const AppShell = lazy(() => import("./components/shell/AppShell").then((module) => ({ default: module.AppShell })));

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const wantsLittleOrange =
    window.location.pathname.toLowerCase().includes("littleorange") ||
    params.get("surface")?.toLowerCase() === "littleorange" ||
    params.get("app")?.toLowerCase() === "littleorange";

  if (wantsLittleOrange) return <LittleOrangeApp />;

  return (
    <Suspense fallback={null}>
      <AppShell />
    </Suspense>
  );
}
