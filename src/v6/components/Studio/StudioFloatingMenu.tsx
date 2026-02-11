import { useStudioStore } from './studio-store';
import { LinearIcon } from '../icons/linear-icon';

export function StudioFloatingMenu() {
    const selection = useStudioStore((s: any) => s.selection);
    const updatePage = useStudioStore((s: any) => s.updatePage);
    const movePage = useStudioStore((s: any) => s.movePage);
    const addDocument = useStudioStore((s: any) => s.addDocument);
    const documents = useStudioStore((s: any) => s.documents);
    const clearSelection = () => useStudioStore.getState().setSelection([]);

    const rotateSelection = (angle: number) => {
        selection.forEach((s: any) => {
            const doc = documents.find((d: any) => d.id === s.docId);
            const page = doc?.pages.find((p: any) => p.id === s.pageId);
            if (page) {
                updatePage(s.docId, s.pageId, { rotation: (page.rotation + angle) % 360 });
            }
        });
    };

    const deleteSelection = () => {
        selection.forEach((s: any) => {
            // ... logical delete
        });
        clearSelection();
    };

    const handleSplit = () => {
        if (selection.length === 0) return;

        const newDocId = Math.random().toString(36).substr(2, 9);
        // Create new doc slightly offset from first selected item's doc
        const firstS = selection[0];
        const sourceDoc = documents.find((d: any) => d.id === firstS.docId);

        addDocument({
            id: newDocId,
            name: 'Split Result',
            x: (sourceDoc?.x ?? 0) + 300,
            y: (sourceDoc?.y ?? 0),
            pages: [] // movePage will fill this
        });

        selection.forEach((s: any) => {
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
