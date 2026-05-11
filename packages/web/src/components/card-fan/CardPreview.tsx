import type { ReactNode } from "react";
import { Overlay } from "../ui/Overlay";

interface CardPreviewProps {
  children: ReactNode | null;
  onClose: () => void;
}

export default function CardPreview({ children, onClose }: CardPreviewProps) {
  if (!children) return null;
  return (
    <Overlay onClose={onClose} contentClassName="w-80">
      {children}
    </Overlay>
  );
}
