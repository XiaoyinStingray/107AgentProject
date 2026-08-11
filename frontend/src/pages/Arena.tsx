import { useLocation } from "react-router-dom";
import EmptyState from "../components/shared/EmptyState";
import { findItemById } from "../data/menuData";
import ABTestArena from "./arena/ABTestArena";
import ArenaComparisonView from "./arena/ArenaComparisonView";
import ArenaReportView from "./arena/ArenaReportView";
import BattleRoyaleArena from "./arena/BattleRoyaleArena";
import BlindTestArena from "./arena/BlindTestArena";
import DuelArena from "./arena/DuelArena";
import LeaderboardView from "./arena/LeaderboardView";


/** M4 竞技场入口：按菜单 hash 分发全部功能。 */
export default function Arena() {
  const { hash } = useLocation();
  const itemId = parseArenaItemId(hash);

  if (itemId === null || itemId === 22) return <DuelArena />;
  if (itemId === 23) return <BattleRoyaleArena />;
  if (itemId === 24) return <ArenaReportView />;
  if (itemId === 25) return <BlindTestArena />;
  if (itemId === 26) return <ArenaComparisonView />;
  if (itemId === 27) return <LeaderboardView />;
  if (itemId === 28) return <ABTestArena />;

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


const ARENA_HASH_MAP: Record<string, number> = {
  duel: 22, battle: 23, report: 24, blind: 25, review: 26, leaderboard: 27, abtest: 28,
};

function parseArenaItemId(hash: string): number | null {
  // 新锚点
  const key = hash.replace(/^#/, "");
  if (ARENA_HASH_MAP[key]) return ARENA_HASH_MAP[key];
  // 兼容旧格式
  if (/^#item-\d+$/.test(hash)) return Number.parseInt(hash.slice(6), 10);
  return null;
}
