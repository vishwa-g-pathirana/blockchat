import type { ReactNode } from "react";
import type { ViewId } from "../store";

/** SVG path content for each view's nav icon (shared by the rail + mobile bottom nav). */
export const ICONS: Record<ViewId, ReactNode> = {
  public: <path d="M4 5h16v11H7l-3 3z" />,
  private: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  network: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="7" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M7.5 7.5l3 8M16.5 8.5l-3.5 7" />
    </>
  ),
  mynode: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </>
  ),
};
