/* 全站统一的线性 SVG 图标（无外部图标库依赖） */

const paths = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7.5" height="9" rx="1.8" />
      <rect x="13.5" y="3" width="7.5" height="5.5" rx="1.8" />
      <rect x="13.5" y="12" width="7.5" height="9" rx="1.8" />
      <rect x="3" y="15.5" width="7.5" height="5.5" rx="1.8" />
    </>
  ),
  library: (
    <>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H9v18H5.5A1.5 1.5 0 0 1 4 19.5z" />
      <path d="M9 3h5v18H9z" />
      <path d="M14.5 4.2l4.6-1.1 2.4 16.4-4.6 1.1z" />
    </>
  ),
  reader: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 16h4" />
    </>
  ),
  map: (
    <>
      <circle cx="5.5" cy="6" r="2.5" />
      <circle cx="18.5" cy="5" r="2.2" />
      <circle cx="12" cy="13" r="2.8" />
      <circle cx="5" cy="19" r="2.2" />
      <circle cx="19" cy="18.5" r="2.5" />
      <path d="M7.6 7.4l2.6 3.4M14.5 11.6l2.8-4.6M13.9 15l3.4 2.2M9.6 14.6l-3 3" />
    </>
  ),
  flask: (
    <>
      <path d="M9.5 3h5M10.5 3v5.2L4.8 18a2 2 0 0 0 1.8 3h10.8a2 2 0 0 0 1.8-3l-5.7-9.8V3" />
      <path d="M7.5 14.5h9" />
    </>
  ),
  quiz: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.2l2.4 2.4 4.6-5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c1.2-3.6 4.1-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
    </>
  ),
  plane: (
    <path d="M21 3L3 10.5l6.2 2.3L11.5 19l3-4.2L20 17z M9.2 12.8L21 3" />
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  chevronsLeft: <path d="M11 7l-5 5 5 5M18 7l-5 5 5 5" />,
  flame: (
    <path d="M12 3c1 3-3 4.5-3 8a3.5 3.5 0 0 0 7 0c0-1.5-.8-2.6-.8-2.6S18 10 18 13.5A6 6 0 0 1 6 13.5C6 8 11 6.5 12 3z" />
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  arrowRight: <path d="M4 12h15M13 6l6 6-6 6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  spark: (
    <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z M19 16l.9 3.1L23 20l-3.1.9L19 24l-.9-3.1L15 20l3.1-.9z" />
  ),
  nodes: (
    <>
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="12" cy="6" r="2.5" />
      <circle cx="18" cy="16" r="2.5" />
      <path d="M7.5 15.8l3.2-7.3M13.9 7.6l2.9 6" />
    </>
  ),
  trendUp: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  grip: (
    <>
      <circle cx="9" cy="6" r="1.2" />
      <circle cx="15" cy="6" r="1.2" />
      <circle cx="9" cy="12" r="1.2" />
      <circle cx="15" cy="12" r="1.2" />
      <circle cx="9" cy="18" r="1.2" />
      <circle cx="15" cy="18" r="1.2" />
    </>
  ),
  refresh: <path d="M20 11a8 8 0 1 0-2.3 6.3M20 5v6h-6" />,
  star: <path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="13" rx="2" />
      <path d="M16 8V3H3v13h5" />
    </>
  ),
  download: <path d="M12 4v11M6 11l6 6 6-6M4 20h16" />,
  upload: <path d="M12 15V4M6 8l6-6 6 6M4 20h16" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  edit: <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z M13.5 6.5l3 3" />,
  book: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 19a2 2 0 0 1 2-2h13" />
    </>
  ),
}

export default function Icon({ name, size = 20, strokeWidth = 1.8 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}