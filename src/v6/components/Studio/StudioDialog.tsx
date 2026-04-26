import { useEffect, useRef, type FormEvent, type KeyboardEvent } from 'react';

interface PromptDialogProps {
    type: 'prompt';
    title: string;
    defaultValue: string;
    onConfirm: (value: string) => void;
    onCancel: () => void;
}

interface ConfirmDialogProps {
    type: 'confirm';
    title: string;
    message?: string;
    confirmLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

type StudioDialogProps = PromptDialogProps | ConfirmDialogProps;

export function StudioDialog(props: StudioDialogProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (props.type === 'prompt') {
            window.requestAnimationFrame(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            });
        }
    }, [props.type]);

    const handleBackdropKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Escape') props.onCancel();
    };

    if (props.type === 'prompt') {
        const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const value = (inputRef.current?.value ?? '').trim();
            if (value) props.onConfirm(value);
        };

        return (
            <div
                className="studio-download-modal-backdrop"
                role="presentation"
                onClick={props.onCancel}
                onKeyDown={handleBackdropKeyDown}
            >
                <div
                    className="studio-download-modal-card"
                    role="dialog"
                    aria-modal="true"
                    aria-label={props.title}
                    onClick={(e) => e.stopPropagation()}
                >
                    <form className="studio-download-modal-form" onSubmit={handleSubmit}>
                        <label className="studio-download-modal-label">
                            {props.title}
                        </label>
                        <input
                            ref={inputRef}
                            className="studio-download-modal-input"
                            type="text"
                            defaultValue={props.defaultValue}
                            autoComplete="off"
                            spellCheck={false}
                        />
                        <div className="studio-download-modal-actions">
                            <button type="button" className="studio-download-modal-ghost" onClick={props.onCancel}>
                                Cancel
                            </button>
                            <button type="submit" className="studio-download-modal-primary">
                                OK
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div
            className="studio-download-modal-backdrop"
            role="presentation"
            onClick={props.onCancel}
            onKeyDown={handleBackdropKeyDown}
        >
            <div
                className="studio-download-modal-card"
                role="dialog"
                aria-modal="true"
                aria-label={props.title}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="studio-download-modal-form">
                    <p className="studio-download-modal-label" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                        {props.title}
                    </p>
                    {props.message && (
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                            {props.message}
                        </p>
                    )}
                    <div className="studio-download-modal-actions">
                        <button className="studio-download-modal-ghost" onClick={props.onCancel}>
                            Cancel
                        </button>
                        <button className="studio-download-modal-primary" onClick={props.onConfirm}>
                            {props.confirmLabel ?? 'Confirm'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
