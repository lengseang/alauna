import React from 'react';
import Svg, { Path, Circle, Rect, Line, Polyline } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

export const SoulIcon = ({ size = 20, color = '#f4f4f5' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 2L14.4 8.6L21 11L14.4 13.4L12 20L9.6 13.4L3 11L9.6 8.6L12 2Z" />
  </Svg>
);

export const CpuIcon = ({ size = 20, color = '#f4f4f5' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Rect x="4" y="4" width="16" height="16" rx="2" />
    <Rect x="9" y="9" width="6" height="6" />
    <Path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
  </Svg>
);

export const MicIcon = ({ size = 20, color = '#f4f4f5' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <Path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <Line x1="12" y1="19" x2="12" y2="22" />
  </Svg>
);

export const AttachmentIcon = ({ size = 18, color = '#a1a1aa' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </Svg>
);

export const ImageIcon = ({ size = 18, color = '#a1a1aa' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <Circle cx="8.5" cy="8.5" r="1.5" />
    <Polyline points="21 15 16 10 5 21" />
  </Svg>
);

export const DocumentIcon = ({ size = 18, color = '#a1a1aa' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <Polyline points="14 2 14 8 20 8" />
    <Line x1="16" y1="13" x2="8" y2="13" />
    <Line x1="16" y1="17" x2="8" y2="17" />
    <Polyline points="10 9 9 9 8 9" />
  </Svg>
);

export const StorageIcon = ({ size = 20, color = '#f4f4f5' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Rect x="2" y="2" width="20" height="8" rx="2" />
    <Rect x="2" y="14" width="20" height="8" rx="2" />
    <Line x1="6" y1="6" x2="6.01" y2="6" strokeWidth={2.5} />
    <Line x1="6" y1="18" x2="6.01" y2="18" strokeWidth={2.5} />
  </Svg>
);

export const ShieldIcon = ({ size = 20, color = '#f4f4f5' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </Svg>
);

export const SlidersIcon = ({ size = 20, color = '#f4f4f5' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Line x1="4" y1="21" x2="4" y2="14" />
    <Line x1="4" y1="10" x2="4" y2="3" />
    <Line x1="12" y1="21" x2="12" y2="12" />
    <Line x1="12" y1="8" x2="12" y2="3" />
    <Line x1="20" y1="21" x2="20" y2="16" />
    <Line x1="20" y1="12" x2="20" y2="3" />
    <Line x1="1" y1="14" x2="7" y2="14" />
    <Line x1="9" y1="8" x2="15" y2="8" />
    <Line x1="17" y1="16" x2="23" y2="16" />
  </Svg>
);

export const TrashIcon = ({ size = 20, color = '#ef4444' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="3 6 5 6 21 6" />
    <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </Svg>
);

export const BackArrowIcon = ({ size = 20, color = '#f4f4f5' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Line x1="19" y1="12" x2="5" y2="12" />
    <Polyline points="12 19 5 12 12 5" />
  </Svg>
);

export const DownloadIcon = ({ size = 20, color = '#f4f4f5' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <Polyline points="7 10 12 15 17 10" />
    <Line x1="12" y1="15" x2="12" y2="3" />
  </Svg>
);

export const SearchIcon = ({ size = 20, color = '#71717a' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="11" cy="11" r="8" />
    <Line x1="21" y1="21" x2="16.65" y2="16.65" />
  </Svg>
);

export const CheckIcon = ({ size = 16, color = '#22c55e' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="20 6 9 17 4 12" />
  </Svg>
);

export const ZapIcon = ({ size = 18, color = '#f59e0b' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </Svg>
);

export const PlayIcon = ({ size = 16, color = '#ffffff' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="5 3 19 12 5 21 5 3" />
  </Svg>
);

export const PauseIcon = ({ size = 16, color = '#ffffff' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Line x1="10" y1="4" x2="10" y2="20" />
    <Line x1="14" y1="4" x2="14" y2="20" />
  </Svg>
);

export const CrossIcon = ({ size = 14, color = '#71717a' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Line x1="18" y1="6" x2="6" y2="18" />
    <Line x1="6" y1="6" x2="18" y2="18" />
  </Svg>
);

export const LayersIcon = ({ size = 18, color = '#38bdf8' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="12 2 2 7 12 12 22 7 12 2" />
    <Polyline points="2 17 12 22 22 17" />
    <Polyline points="2 12 12 17 22 12" />
  </Svg>
);

export const CameraIcon = ({ size = 14, color = '#71717a' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <Circle cx="12" cy="13" r="4" />
  </Svg>
);

export const CodeIcon = ({ size = 14, color = '#71717a' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="16 18 22 12 16 6" />
    <Polyline points="8 6 2 12 8 18" />
  </Svg>
);

export const VideoIcon = ({ size = 14, color = '#71717a' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="23 7 16 12 23 17 23 7" />
    <Rect x="1" y="5" width="15" height="14" rx="2" />
  </Svg>
);

export const MenuIcon = ({ size = 18, color = '#f4f4f5' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Line x1="4" y1="7" x2="20" y2="7" />
    <Line x1="4" y1="12" x2="20" y2="12" />
    <Line x1="4" y1="17" x2="20" y2="17" />
  </Svg>
);

export const PlusIcon = ({ size = 18, color = '#f4f4f5' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Line x1="12" y1="5" x2="12" y2="19" />
    <Line x1="5" y1="12" x2="19" y2="12" />
  </Svg>
);

export const ChevronDownIcon = ({ size = 12, color = '#71717a' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="6 9 12 15 18 9" />
  </Svg>
);


const base = { fill: 'none', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const SendIcon = ({ size = 18, color = '#000000' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
    <Line x1="12" y1="19" x2="12" y2="5" />
    <Polyline points="5 12 12 5 19 12" />
  </Svg>
);

export const StopIcon = ({ size = 16, color = '#000000' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth={1.8} strokeLinejoin="round">
    <Rect x="6" y="6" width="12" height="12" rx="2" />
  </Svg>
);

export const CopyIcon = ({ size = 14, color = '#a1a1aa' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
    <Rect x="9" y="9" width="13" height="13" rx="2" />
    <Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Svg>
);

export const RefreshIcon = ({ size = 14, color = '#a1a1aa' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
    <Polyline points="23 4 23 10 17 10" />
    <Path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </Svg>
);

export const FolderIcon = ({ size = 20, color = '#f4f4f5' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
    <Path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </Svg>
);

export const AlertIcon = ({ size = 16, color = '#f59e0b' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
    <Path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <Line x1="12" y1="9" x2="12" y2="13" />
    <Line x1="12" y1="17" x2="12.01" y2="17" />
  </Svg>
);

export const InfoIcon = ({ size = 16, color = '#38bdf8' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
    <Circle cx="12" cy="12" r="10" />
    <Line x1="12" y1="16" x2="12" y2="12" />
    <Line x1="12" y1="8" x2="12.01" y2="8" />
  </Svg>
);

export const ChevronRightIcon = ({ size = 14, color = '#71717a' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
    <Polyline points="9 18 15 12 9 6" />
  </Svg>
);

export const ChevronUpIcon = ({ size = 12, color = '#71717a' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
    <Polyline points="18 15 12 9 6 15" />
  </Svg>
);

export const IncognitoIcon = ({ size = 16, color = '#a1a1aa' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
    <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <Line x1="1" y1="1" x2="23" y2="23" />
  </Svg>
);

export const PhoneIcon = ({ size = 20, color = '#f4f4f5' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
    <Rect x="5" y="2" width="14" height="20" rx="2" />
    <Line x1="12" y1="18" x2="12.01" y2="18" />
  </Svg>
);

export const ThinkIcon = ({ size = 14, color = '#a1a1aa' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...base}>
    <Path d="M9 18h6M10 22h4" />
    <Path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z" />
  </Svg>
);
