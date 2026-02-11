import type { SVGProps } from 'react';

type LinearIconName =
  | 'upload'
  | 'play'
  | 'download'
  | 'chevron-up'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'refresh'
  | 'x'
  | 'merge'
  | 'split'
  | 'compress'
  | 'unlock'
  | 'delete-pages'
  | 'ocr'
  | 'image'
  | 'word'
  | 'lock'
  | 'rotate'
  | 'excel'
  | 'tool';

interface LinearIconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  name: LinearIconName;
}

type ToolIconName =
  | 'merge'
  | 'split'
  | 'compress'
  | 'unlock'
  | 'delete-pages'
  | 'ocr'
  | 'image'
  | 'word'
  | 'lock'
  | 'rotate'
  | 'excel'
  | 'tool';

function isToolIconName(name: LinearIconName): name is ToolIconName {
  return (
    name === 'merge' ||
    name === 'split' ||
    name === 'compress' ||
    name === 'unlock' ||
    name === 'delete-pages' ||
    name === 'ocr' ||
    name === 'image' ||
    name === 'word' ||
    name === 'lock' ||
    name === 'rotate' ||
    name === 'excel' ||
    name === 'tool'
  );
}

function renderToolGlyph(name: ToolIconName): JSX.Element {
  switch (name) {
    case 'merge':
      return (
        <>
          <path d="M8 10h2.5l2.2 2.2H16" />
          <path d="m14.5 10.6 1.5 1.6-1.5 1.6" />
          <path d="M8 14h2.2l1.2-1.2" />
        </>
      );
    case 'split':
      return (
        <>
          <path d="M8 12h3.2" />
          <path d="M11.2 12 13 10.2h3" />
          <path d="M11.2 12 13 13.8h3" />
          <path d="m14.6 9.2 1.4 1-1.4 1" />
          <path d="m14.6 12.8 1.4 1-1.4 1" />
        </>
      );
    case 'compress':
      return (
        <>
          <path d="M8 10.2h8" />
          <path d="M8 12.5h6.4" />
          <path d="M8 14.8h8" />
          <path d="m13.6 11.4 1.2 1.1-1.2 1.1" />
        </>
      );
    case 'unlock':
      return (
        <>
          <rect x="8" y="12" width="8" height="5" rx="1.6" />
          <path d="M10 12V10.6a2.6 2.6 0 1 1 5.2 0" />
        </>
      );
    case 'delete-pages':
      return (
        <>
          <rect x="8.2" y="10.2" width="7.6" height="7.2" rx="1.3" />
          <path d="M9.2 10.2h5.6" />
          <path d="m10.4 12.4 3.2 3.2" />
          <path d="m13.6 12.4-3.2 3.2" />
        </>
      );
    case 'ocr':
      return (
        <>
          <rect x="8" y="9.8" width="8" height="6.6" rx="1.2" />
          <path d="M10.2 11.4v3.4" />
          <path d="M13.8 11.4h-1.8v3.4h1.8" />
          <path d="M14.8 14.8h1.4a1 1 0 1 0 0-2h-1.4v-1.4h1.4" />
        </>
      );
    case 'image':
      return (
        <>
          <rect x="8" y="9.4" width="8" height="7.2" rx="1.2" />
          <circle cx="10.4" cy="11.6" r="0.8" />
          <path d="m15.2 15.8-2.3-2.2-2.5 2.4" />
        </>
      );
    case 'word':
      return (
        <>
          <rect x="8" y="9.6" width="8" height="6.8" rx="1.2" />
          <path d="m9.5 11 1 4 1-2.1 1 2.1 1-4" />
        </>
      );
    case 'lock':
      return (
        <>
          <rect x="8" y="12" width="8" height="5" rx="1.6" />
          <path d="M10 12v-1.5a2.6 2.6 0 1 1 5.2 0V12" />
        </>
      );
    case 'rotate':
      return (
        <>
          <path d="M15.8 12a3.8 3.8 0 1 1-1.4-3" />
          <path d="m14.4 8.2.1 2.3-2.3.1" />
        </>
      );
    case 'excel':
      return (
        <>
          <rect x="8" y="9.6" width="8" height="6.8" rx="1.2" />
          <path d="m10 11.2 4 3.6" />
          <path d="m14 11.2-4 3.6" />
        </>
      );
    case 'tool':
      return (
        <>
          <path d="m10.2 15.4 3.6-3.6" />
          <path d="m12.8 9.6 1.6 1.6" />
          <path d="m9.4 14.6.8.8" />
        </>
      );
    default:
      return <></>;
  }
}

export function LinearIcon({ name, ...props }: LinearIconProps): JSX.Element {
  const isToolIcon = isToolIconName(name);

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {isToolIcon && (
        <>
          <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
          <path d="M7.8 7.4h8.4" />
          {renderToolGlyph(name)}
        </>
      )}
      {name === 'upload' && (
        <>
          <path d="M12 15V5" />
          <path d="m8 9 4-4 4 4" />
          <path d="M4 16.5v1a2.5 2.5 0 0 0 2.5 2.5h11a2.5 2.5 0 0 0 2.5-2.5v-1" />
        </>
      )}
      {name === 'play' && <path d="m9 7 9 5-9 5V7Z" />}
      {name === 'download' && (
        <>
          <path d="M12 4v10" />
          <path d="m8 10 4 4 4-4" />
          <path d="M4 18h16" />
        </>
      )}
      {name === 'chevron-up' && <path d="m6 14 6-6 6 6" />}
      {name === 'chevron-down' && <path d="m6 10 6 6 6-6" />}
      {name === 'chevron-left' && <path d="m14 6-6 6 6 6" />}
      {name === 'chevron-right' && <path d="m10 6 6 6-6 6" />}
      {name === 'refresh' && (
        <>
          <path d="M3 11a9 9 0 0 1 15.7-5.9L21 7" />
          <path d="M21 13a9 9 0 0 1-15.7 5.9L3 17" />
        </>
      )}
      {name === 'x' && (
        <>
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </>
      )}
    </svg>
  );
}
