import { useLocation } from "react-router-dom";
import EmptyState from "../components/shared/EmptyState";
import { findItemById } from "../data/menuData";
import ArenaComparisonView from "./arena/ArenaComparisonView";
import ArenaReportView from "./arena/ArenaReportView";
import BattleRoyaleArena from "./arena/BattleRoyaleArena";
import DuelArena from "./arena/DuelArena";


/** M4 竞技场入口：按菜单 hash 分发四个 Step 46 功能。 */
export default function Arena() {
  const { hash } = useLocation();
  const itemId = parseArenaItemId(hash);

  if (itemId === null || itemId === 22) return <DuelArena />;
  if (itemId === 23) return <BattleRoyaleArena />;
  if (itemId === 24) return <ArenaReportView />;
  if (itemId === 26) return <ArenaComparisonView />;

  const selectedItem = findItemById(itemId);
  const belongsToArena = selectedItem?.sectionTitle === "M4 竞技场";
  return (
    <div className="h-full p-6 animate-fade-in motion-reduce:animate-none">
      <EmptyState
        title={
          belongsToArena
            ? `${selectedItem.emoji} ${selectedItem.label}`
            : "竞技场功能不存在"
        }
        description={
          belongsToArena
            ? "该功能保留入口，将在后续版本继续开发。"
            : "请从 M4 竞技场菜单中选择功能。"
        }
        tier={belongsToArena ? selectedItem.priority : undefined}
      />
    </div>
  );
}


function parseArenaItemId(hash: string): number | null {
  if (!/^#item-\d+$/.test(hash)) return null;
  const itemId = Number.parseInt(hash.slice(6), 10);
  return Number.isSafeInteger(itemId) ? itemId : null;
}
