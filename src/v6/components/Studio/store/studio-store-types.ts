export interface PageItem {
    id: string;
    fileId: string;
    pageIndex: number;
    thumbnailUrl: string;
    rotation: number;
}

export interface DetachedPageItem extends PageItem {
    x: number;
    y: number;
}

export interface StudioDocumentRedactVerify {
    runId: string;
    passed: boolean;
    checks: Array<{ id: string; result: string; label: string }>;
    certificateJson?: string;
    updatedAt: number;
}

export interface StudioDocument {
    id: string;
    name: string;
    pages: PageItem[];
    x: number;
    y: number;
    isModified?: boolean;
    allowEmpty?: boolean;
    includeInExport?: boolean;
    /** Latest redact verification from Studio text-edit apply; gates export when present. */
    lastRedactVerify?: StudioDocumentRedactVerify;
}

export type StudioInteractionMode = 'edit' | 'convert' | null;
export type StudioOperationScope = 'selection' | 'document';
export type StudioEditToolId = 'text' | 'sign' | 'annotate' | 'whiteout' | 'shapes' | 'forms' | 'watermark' | 'protect';

export interface StudioEditSession {
    docId: string;
    pageId: string;
    pageIndex: number;
    sourceFileId: string;
    workingFileId: string;
    activeTool: StudioEditToolId | null;
    startedAt: number;
}

export interface SaveCheckpointEntry {
    docId: string;
    pageId: string;
    pageIndex: number;
    prevFileId: string;
    prevThumbnailUrl: string;
    nextFileId: string;
    nextThumbnailUrl: string;
}

export interface SaveCheckpoint {
    entries: SaveCheckpointEntry[];
}

export interface IWorkspaceSnapshot {
    documents: StudioDocument[];
    detachedPages: DetachedPageItem[];
    activeDocumentId: string | null;
    activeEditPageId: string | null;
    requestedInlineTool: 'compress-pdf' | null;
    operationScope: StudioOperationScope;
    viewScale: number;
    viewPosition: { x: number; y: number };
    selection: { docId: string; pageId: string }[];
    interactionMode: StudioInteractionMode;
}

export type TimelineEventType = 
    | 'system'
    | 'upload'
    | 'delete_page'
    | 'move_page'
    | 'rotate_page'
    | 'edit_save'
    | 'convert'
    | 'protect'
    | 'space_new'
    | 'space_rename'
    | 'space_delete'
    | 'restore';

export interface ITimelineEvent {
    id: string;
    type: TimelineEventType;
    label: string;
    timestamp: number;
    snapshot?: IWorkspaceSnapshot;
    isManualVersion?: boolean;
}
