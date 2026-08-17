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

  if (["#remix", "#item-6"].includes(location.hash)) return <RemixPanel />;
  if (["#models", "#item-7"].includes(location.hash)) return <TemplateBrowser />;
  return <AgentFoundry initialDescription={initialDescription} />;
}
