import { create } from "zustand";

interface SandboxStore {
  /** 当前活跃的沙盒 World ID，跨页面导航保持 */
  activeWorldId: string | null;
  setActiveWorld: (id: string | null) => void;
}

export const useSandboxStore = create<SandboxStore>((set) => ({
  activeWorldId: null,
  setActiveWorld: (id) => set({ activeWorldId: id }),
}));
