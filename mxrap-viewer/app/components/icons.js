const I = ({ size = 14, children, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
    {children}
  </svg>
);

export const IconChevronLeft  = (p) => <I {...p}><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></I>;
export const IconChevronRight = (p) => <I {...p}><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></I>;
export const IconChevronDown  = (p) => <I {...p}><path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></I>;
export const IconChevronUp    = (p) => <I {...p}><path d="M3 10l5-5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></I>;

export const IconEye    = (p) => <I {...p}><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.5"/><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/></I>;
export const IconEyeOff = (p) => <I {...p}><path d="M2 2l12 12M6.5 6.7A3 3 0 0 0 9.3 9.5M4.2 4.4C2.6 5.5 1 8 1 8s3 5 7 5a6.7 6.7 0 0 0 3.8-1.2M7 3.1A6.5 6.5 0 0 1 8 3c4 0 7 5 7 5a13 13 0 0 1-1.7 2.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></I>;

export const IconLayers     = (p) => <I {...p}><path d="M8 1L1 5l7 4 7-4-7-4zM1 11l7 4 7-4M1 8l7 4 7-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></I>;
export const IconMap        = (p) => <I {...p}><path d="M1 3v11l4.5-2 5 2 4.5-2V1L10.5 3l-5-2L1 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M5.5 1v12M10.5 3v11" stroke="currentColor" strokeWidth="1.5"/></I>;
export const IconFilter     = (p) => <I {...p}><path d="M2 4h12M5 8h6M7 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></I>;
export const IconSettings   = (p) => <I {...p}><circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></I>;
export const IconSearch     = (p) => <I {...p}><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/><path d="M14 14l-3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></I>;
export const IconX          = (p) => <I {...p}><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></I>;
export const IconRefresh    = (p) => <I {...p}><path d="M13 2.5A6.5 6.5 0 1 1 5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M5 2V5.5H1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></I>;
export const IconMaximize   = (p) => <I {...p}><path d="M10 2h4v4M6 14H2v-4M14 6l-5 5M2 10l5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></I>;
export const IconMinimize   = (p) => <I {...p}><path d="M10 6V2M10 6h4M6 10H2M6 10v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></I>;
export const IconCamera     = (p) => <I {...p}><path d="M1 5.5A1.5 1.5 0 0 1 2.5 4H4l1.5-2h5L12 4h1.5A1.5 1.5 0 0 1 15 5.5v7A1.5 1.5 0 0 1 13.5 14h-11A1.5 1.5 0 0 1 1 12.5v-7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><circle cx="8" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5"/></I>;
export const IconFitView    = (p) => <I {...p}><path d="M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><rect x="5" y="5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/></I>;
export const IconCube       = (p) => <I {...p}><path d="M8 2L2 5.5v5L8 14l6-3.5v-5L8 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M2 5.5L8 9l6-3.5M8 9v5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></I>;
export const IconGrid       = (p) => <I {...p}><rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/></I>;
export const IconInfo       = (p) => <I {...p}><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/><path d="M8 7v5M8 5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></I>;
export const IconAlert      = (p) => <I {...p}><path d="M8 2L1 14h14L8 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M8 7v3M8 12v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></I>;
export const IconFile       = (p) => <I {...p}><path d="M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M10 2v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></I>;
export const IconPinDrop    = (p) => <I {...p}><path d="M8 1a4 4 0 0 1 4 4c0 3-4 9-4 9S4 8 4 5a4 4 0 0 1 4-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><circle cx="8" cy="5" r="1.5" fill="currentColor"/></I>;
export const IconCrosshair  = (p) => <I {...p}><circle cx="8" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M8 1v3M8 12v3M1 8h3M12 8h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></I>;
export const IconTag        = (p) => <I {...p}><path d="M1 1h6l7 7-6 6-7-7V1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><circle cx="4.5" cy="4.5" r="1" fill="currentColor"/></I>;
export const IconSurface    = (p) => <I {...p}><path d="M1 12L5 4l4 5 3-3 3 6H1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></I>;
export const IconDot        = (p) => <I {...p}><circle cx="8" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/></I>;
export const IconMinus      = (p) => <I {...p}><path d="M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></I>;
export const IconPlus       = (p) => <I {...p}><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></I>;
export const IconRotate     = (p) => <I {...p}><path d="M4 2.5A6.5 6.5 0 1 0 10 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M10 2V5.5H6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></I>;
export const IconPerspective= (p) => <I {...p}><path d="M2 13L5 4h6l3 9H2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M5 4L3 1M11 4l2-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></I>;
export const IconOrtho      = (p) => <I {...p}><rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.5"/><path d="M2 6h12M2 10h12M6 2v12M10 2v12" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5"/></I>;
export const IconLegend     = (p) => <I {...p}><rect x="2" y="3" width="4" height="4" rx="1" fill="currentColor" opacity="0.7"/><rect x="2" y="9" width="4" height="4" rx="1" fill="currentColor" opacity="0.4"/><path d="M9 5h5M9 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></I>;
export const IconSpinner    = (p) => <I {...p}><path d="M8 1.5A6.5 6.5 0 0 1 14.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="0.8s" repeatCount="indefinite"/></path></I>;
export const IconMxrap      = (p) => <I {...p} size={p.size ?? 16}><path d="M2 13V4l4 5 2-4 2 4 4-5v9H2z" fill="currentColor" opacity="0.9"/><path d="M2 4l4 5 2-4 2 4 4-5" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.5"/></I>;
