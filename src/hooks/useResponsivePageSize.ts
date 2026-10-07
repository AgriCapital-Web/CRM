import { useEffect, useState } from "react";

const getPageSize = (width: number) => {
  if (width < 640) return 5;
  if (width < 1024) return 8;
  return 10;
};

export function useResponsivePageSize() {
  const [pageSize, setPageSize] = useState(() =>
    typeof window === "undefined" ? 10 : getPageSize(window.innerWidth),
  );

  useEffect(() => {
    const update = () => setPageSize(getPageSize(window.innerWidth));
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);

  return pageSize;
}
