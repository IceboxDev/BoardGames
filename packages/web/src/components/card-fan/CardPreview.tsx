import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { useEffect } from "react";

const SPRING = { type: "spring" as const, stiffness: 300, damping: 25 };

interface CardPreviewProps {
  children: ReactNode | null;
  onClose: () => void;
}

export default function CardPreview({ children, onClose }: CardPreviewProps) {
  useEffect(() => {
    if (!children) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [children, onClose]);

  return (
    <AnimatePresence>
      {children && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div className="absolute inset-0 bg-black/70" onClick={onClose} />
          <motion.div
            className="relative z-10 pointer-events-none w-80"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={SPRING}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
