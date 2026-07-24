import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import AgentFoundry from "./AgentFoundry";
import RemixPanel from "./agent-foundry/RemixPanel";
import TemplateBrowser from "./agent-foundry/TemplateBrowser";


/** M1 内部功能分流；既有 AgentFoundry 保持原样。 */
export default function AgentModule() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationState = location.state as {
    initialDescription?: string;
  } | null;
  const initialDescription = navigationState?.initialDescription ?? "";

  useEffect(() => {
    if (!initialDescription) return;
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: null,
    });
  }, [
    initialDescription,
    location.hash,
    location.pathname,
    location.search,
    navigate,
  ]);

  if (location.hash === "#item-6") return <RemixPanel />;
  if (location.hash === "#item-7") return <TemplateBrowser />;
  return <AgentFoundry initialDescription={initialDescription} />;
}
