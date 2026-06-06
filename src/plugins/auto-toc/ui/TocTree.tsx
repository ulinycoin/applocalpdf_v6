import { useState, useCallback, useRef, useEffect } from 'react';
import { LinearIcon } from '../../../v6/components/icons/linear-icon';
import type { HeaderNode } from '../logic/index';

interface TocTreeProps {
  headers: HeaderNode[];
  onChange: (headers: HeaderNode[]) => void;
}

/** Convert flat HeaderNode[] into a nested tree for rendering */
interface TreeItem extends HeaderNode {
  depth: number;
  children: TreeItem[];
}

/** Build a tree structure from flat headers for display */
function buildTree(headers: HeaderNode[]): TreeItem[] {
  const tree: TreeItem[] = [];

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    const item: TreeItem = { ...h, depth: 0, children: [] };

    // Check if there's a preceding item with a lower level (parent candidate)
    let parentFound = false;
    for (let j = i - 1; j >= 0; j--) {
      const prev = headers[j];
      if (prev.level < h.level) {
        // Find this prev in the tree and add as child
        const addAsChild = (parentList: TreeItem[]): boolean => {
          for (const p of parentList) {
            if (p.id === prev.id) {
              item.depth = p.depth + 1;
              p.children.push(item);
              return true;
            }
            if (addAsChild(p.children)) return true;
          }
          return false;
        };
        addAsChild(tree);
        parentFound = true;
        break;
      }
    }

    if (!parentFound) {
      tree.push(item);
    }
  }

  return tree;
}

function TocTreeItemRow({
  item,
  onToggle,
  onRename,
  onLevelUp,
  onLevelDown,
  onDelete,
}: {
  item: TreeItem;
  onToggle: () => void;
  onRename: (text: string) => void;
  onLevelUp: () => void;
  onLevelDown: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(item.text);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleDoubleClick = useCallback(() => {
    setEditText(item.text);
    setEditing(true);
  }, [item.text]);

  const handleBlur = useCallback(() => {
    if (editText.trim()) {
      onRename(editText.trim());
    }
    setEditing(false);
  }, [editText, onRename]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleBlur();
    else if (e.key === 'Escape') {
      setEditText(item.text);
      setEditing(false);
    }
  }, [handleBlur, item.text]);

  return (
    <div
      className="toc-tree-item"
      style={{
        paddingLeft: item.depth * 20 + 8,
        opacity: item.enabled ? 1 : 0.45,
      }}
    >
      <label className="toc-tree-item-checkbox" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={item.enabled} onChange={onToggle} />
        <span className="toc-tree-checkbox-visual" />
      </label>

      <div className="toc-tree-item-body" onDoubleClick={handleDoubleClick}>
        {editing ? (
          <input
            ref={inputRef}
            className="toc-tree-item-input"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <span className="toc-tree-item-text" title={item.text}>{item.text}</span>
        )}
      </div>

      <div className="toc-tree-item-level-badge">H{item.level}</div>
      <div className="toc-tree-item-page">p.{item.pageIndex + 1}</div>

      <div className="toc-tree-item-actions">
        <button type="button" className="toc-tree-btn" onClick={onLevelUp} title="Promote" disabled={item.level <= 1}>
          <LinearIcon name="chevron-left" size={12} />
        </button>
        <button type="button" className="toc-tree-btn" onClick={onLevelDown} title="Demote" disabled={item.level >= 3}>
          <LinearIcon name="chevron-right" size={12} />
        </button>
        <button type="button" className="toc-tree-btn toc-tree-btn-danger" onClick={onDelete} title="Remove">
          <LinearIcon name="x" size={12} />
        </button>
      </div>
    </div>
  );
}

/** Recursively render tree items, tracking flat index for callbacks */
function renderTreeItems(
  items: TreeItem[],
  flattened: HeaderNode[],
  onUpdate: (headers: HeaderNode[]) => void,
  startAt: number,
): { elements: JSX.Element[]; nextAt: number } {
  const elements: JSX.Element[] = [];
  let idx = startAt;

  for (const item of items) {
    const myIdx = idx;
    idx++;

    const handleToggle = () => {
      const next = [...flattened];
      next[myIdx] = { ...next[myIdx], enabled: !next[myIdx].enabled };
      onUpdate(next);
    };
    const handleRename = (text: string) => {
      const next = [...flattened];
      next[myIdx] = { ...next[myIdx], text };
      onUpdate(next);
    };
    const handleLevelUp = () => {
      const next = [...flattened];
      if (next[myIdx].level > 1) {
        next[myIdx] = { ...next[myIdx], level: next[myIdx].level - 1 };
        onUpdate(next);
      }
    };
    const handleLevelDown = () => {
      const next = [...flattened];
      if (next[myIdx].level < 3) {
        next[myIdx] = { ...next[myIdx], level: next[myIdx].level + 1 };
        onUpdate(next);
      }
    };
    const handleDelete = () => onUpdate(flattened.filter((_, i) => i !== myIdx));

    elements.push(
      <TocTreeItemRow
        key={item.id}
        item={item}
        onToggle={handleToggle}
        onRename={handleRename}
        onLevelUp={handleLevelUp}
        onLevelDown={handleLevelDown}
        onDelete={handleDelete}
      />,
    );

    if (item.children.length > 0) {
      const childResult = renderTreeItems(item.children, flattened, onUpdate, idx);
      elements.push(...childResult.elements);
      idx = childResult.nextAt;
    }
  }

  return { elements, nextAt: idx };
}

export function TocTree({ headers, onChange }: TocTreeProps) {
  const [newText, setNewText] = useState('');
  const [newPage, setNewPage] = useState(1);
  const [showAddForm, setShowAddForm] = useState(false);

  const tree = buildTree(headers);

  const handleAdd = useCallback(() => {
    if (!newText.trim()) return;
    const newHeader: HeaderNode = {
      id: `hdr-new-${Date.now()}`,
      text: newText.trim(),
      pageIndex: Math.max(0, newPage - 1),
      y: 0,
      level: 1,
      enabled: true,
    };
    onChange([...headers, newHeader]);
    setNewText('');
    setNewPage(1);
    setShowAddForm(false);
  }, [newText, newPage, headers, onChange]);

  const handleSelectAll = useCallback(() => {
    onChange(headers.map((h) => ({ ...h, enabled: true })));
  }, [headers, onChange]);

  const handleDeselectAll = useCallback(() => {
    onChange(headers.map((h) => ({ ...h, enabled: false })));
  }, [headers, onChange]);

  const renderResult = renderTreeItems(tree, headers, onChange, 0);

  return (
    <div className="toc-tree-root">
      <div className="toc-tree-toolbar">
        <span className="toc-tree-count">{headers.length} heading{headers.length !== 1 ? 's' : ''} detected</span>
        <div className="toc-tree-toolbar-actions">
          <button type="button" className="toc-tree-toolbar-btn" onClick={handleSelectAll}>
            <LinearIcon name="check" size={12} /> All
          </button>
          <button type="button" className="toc-tree-toolbar-btn" onClick={handleDeselectAll}>
            <LinearIcon name="x" size={12} /> None
          </button>
          <button type="button" className="toc-tree-toolbar-btn" onClick={() => setShowAddForm(!showAddForm)}>
            <LinearIcon name="plus" size={12} /> Add
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="toc-tree-add-form">
          <input
            className="toc-tree-add-input"
            placeholder="Heading text..."
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          />
          <div className="toc-tree-add-row">
            <label className="toc-tree-add-label">
              Page:
              <input
                type="number"
                className="toc-tree-add-page-input"
                min={1}
                value={newPage}
                onChange={(e) => setNewPage(Math.max(1, parseInt(e.target.value, 10) || 1))}
              />
            </label>
            <button type="button" className="toc-tree-toolbar-btn toc-tree-add-btn" onClick={handleAdd}>Add</button>
          </div>
        </div>
      )}

      <div className="toc-tree-list custom-scrollbar">
        {tree.length === 0 ? (
          <div className="toc-tree-empty">
            No headings detected. Try adjusting detection settings or add a heading manually.
          </div>
        ) : (
          renderResult.elements
        )}
      </div>
    </div>
  );
}
