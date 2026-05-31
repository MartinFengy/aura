"use client";

import { motion } from "framer-motion";

export function BalloonBackground() {
  return (
    <div className="pointer-events-none absolute inset-0">
      {[0, 1, 2, 3, 4].map((item) => (
        <motion.span
          key={item}
          className={`balloon balloon-${item + 1}`}
          animate={{ y: [0, -18, 0], rotate: [0, 4, -2, 0], scale: [1, 1.02, 1] }}
          transition={{
            duration: 10 + item * 2,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
