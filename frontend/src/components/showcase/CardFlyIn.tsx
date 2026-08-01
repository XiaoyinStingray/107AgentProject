/**
 * CardFlyIn — Step 100a: 卡片飞入动画包装器。
 *
 * 新卡片: scale(0) → scale(1.05) → scale(1)，持续 400ms。
 * 相邻卡片按列依次延迟 80ms，产生涌入感。
 */

import { useEffect, useState, type ReactNode } from "react";

interface Props {
  index: number;
  children: ReactNode;
}

export default function CardFlyIn({ index, children }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const delay = 80 * index;
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [index]);

  return (
    <div
      className="transition-all duration-400 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "scale(1)" : "scale(0)",
        transitionDuration: "400ms",
        transitionDelay: `${80 * index}ms`,
      }}
    >
      {children}
    </div>
  );
}
