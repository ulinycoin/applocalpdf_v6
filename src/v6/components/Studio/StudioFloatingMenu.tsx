import { PageItem, StudioDocument, StudioState, useStudioStore } from './studio-store';
import { LinearIcon } from '../icons/linear-icon';

interface SelectionItem {
    docId: string;
    pageId: string;
}

export function StudioFloatingMenu() {
    const selection = useStudioStore((s: StudioState) => s.selection);
    const updatePage = useStudioStore((s: StudioState) => s.updatePage);
    const movePage = useStudioStore((s: StudioState) => s.movePage);
    const addDocument = useStudioStore((s: StudioState) => s.addDocument);
    const documents = useStudioStore((s: StudioState) => s.documents);
    const clearSelection = () => useStudioStore.getState().setSelection([]);

    const rotateSelection = (angle: number) => {
        selection.forEach((s: SelectionItem) => {
            const doc = documents.find((d: StudioDocument) => d.id === s.docId);
            const page = doc?.pages.find((p: PageItem) => p.id === s.pageId);
            if (page) {
                updatePage(s.docId, s.pageId, { rotation: (page.rotation + angle) % 360 });
            }
        });
    };

    const deleteSelection = () => {
        selection.forEach((_s: SelectionItem) => {
            // ... logical delete
        });
        clearSelection();
    };

    const handleSplit = () => {
        if (selection.length === 0) return;

        const newDocId = Math.random().toString(36).substr(2, 9);
        // Create new doc slightly offset from first selected item's doc
        const firstS = selection[0];
        const sourceDoc = documents.find((d: StudioDocument) => d.id === firstS.docId);

        addDocument({
            id: newDocId,
            name: 'Split Result',
            x: (sourceDoc?.x ?? 0) + 300,
            y: (sourceDoc?.y ?? 0),
            pages: [] // movePage will fill this
        });

        selection.forEach((s: SelectionItem) => {
            movePage(s.docId, s.pageId, newDocId);
        });

        clearSelection();
    };

    if (selection.length === 0) return null;

    return (
        <div className="studio-floating-menu animate-slide-up">
            <div className="studio-menu-info">
                <span className="studio-menu-count">{selection.length}</span>
                <span>Selected</span>
            </div>
            <div className="studio-menu-divider" />
            <div className="studio-menu-actions">
                <button className="menu-btn" title="Rotate Clockwise" onClick={() => rotateSelection(90)}>
                    <LinearIcon name="rotate" className="linear-icon" />
                </button>
                <button className="menu-btn" title="Delete Pages" onClick={() => deleteSelection()}>
                    <LinearIcon name="delete-pages" className="linear-icon" />
                </button>
                <button className="menu-btn" title="Duplicate">
                    <LinearIcon name="tool" className="linear-icon" />
                </button>
                <div className="studio-menu-divider" />
                <button className="menu-btn" title="Split into new document" onClick={handleSplit}>
                    <LinearIcon name="split" className="linear-icon" />
                    <span style={{ fontSize: '10px', fontWeight: 'bold' }}>SPLIT</span>
                </button>
            </div>
            <div className="studio-menu-divider" />
            <button className="menu-btn btn-close" onClick={clearSelection}>
                <LinearIcon name="x" className="linear-icon" />
            </button>
        </div>
    );
}
