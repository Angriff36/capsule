import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { recordHistoryEntry } from "./listOrigin";

export function ListNavigationManager() {
  const location = useLocation();

  useEffect(() => {
    const index = window.history.state?.idx;
    if (typeof index === "number") recordHistoryEntry(index, location.key);
  }, [location.key]);

  return null;
}
