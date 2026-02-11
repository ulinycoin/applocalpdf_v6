import { NavLink } from 'react-router-dom';
import { LinearIcon } from '../../v6/components/icons/linear-icon';
import { usePlatform } from './platform-context';

function getToolIcon(toolId: string): Parameters<typeof LinearIcon>[0]['name'] {
  switch (toolId) {
    case 'merge-pdf':
      return 'merge';
    case 'split-pdf':
      return 'split';
    case 'compress-pdf':
      return 'compress';
    case 'unlock-pdf':
      return 'unlock';
    case 'delete-pages-pdf':
      return 'delete-pages';
    case 'ocr-pdf':
      return 'ocr';
    case 'pdf-to-jpg':
      return 'image';
    case 'word-to-pdf':
      return 'word';
    case 'encrypt-pdf':
      return 'lock';
    case 'rotate-pdf':
      return 'rotate';
    case 'excel-to-pdf':
      return 'excel';
    default:
      return 'tool';
  }
}

function getToolShortLabel(toolId: string): string {
  switch (toolId) {
    case 'merge-pdf':
      return 'MRG';
    case 'split-pdf':
      return 'SPL';
    case 'compress-pdf':
      return 'CMP';
    case 'unlock-pdf':
      return 'UNL';
    case 'delete-pages-pdf':
      return 'DEL';
    case 'ocr-pdf':
      return 'OCR';
    case 'pdf-to-jpg':
      return 'JPG';
    case 'word-to-pdf':
      return 'DOC';
    case 'encrypt-pdf':
      return 'ENC';
    case 'rotate-pdf':
      return 'ROT';
    case 'excel-to-pdf':
      return 'XLS';
    default:
      return 'TOOL';
  }
}

interface ToolSidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function ToolSidebar({ collapsed, onToggleCollapsed }: ToolSidebarProps) {
  const { menu } = usePlatform();

  return (
    <>
      <div className="brand-header">
        <div className="brand-main">
          <div className="brand-name">{collapsed ? 'LP' : 'LocalPDF V6'}</div>
          <div className="brand-tagline">Worker-native toolkit</div>
        </div>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <LinearIcon name={collapsed ? 'chevron-right' : 'chevron-left'} className="linear-icon" />
        </button>
      </div>
      <nav className="nav-list" aria-label="Tools">
        {menu.map((item) => (
          <div key={item.toolId} className="nav-item">
            <NavLink
              to={item.href}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              title={item.label}
              aria-label={item.label}
            >
              <span className="nav-icon" aria-hidden="true">
                <LinearIcon name={getToolIcon(item.toolId)} className="linear-icon" />
              </span>
              <span className="nav-label">{item.label}</span>
              <span className="nav-label-short" aria-hidden="true">
                {getToolShortLabel(item.toolId)}
              </span>
            </NavLink>
          </div>
        ))}
      </nav>
    </>
  );
}
