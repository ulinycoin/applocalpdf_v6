import type { IFileEntry, IFileSystem } from '../../core/types/contracts';

class MemoryFileEntry implements IFileEntry {
  constructor(readonly id: string, private readonly blob: Blob, private readonly name: string) {}

  getBlob(): Promise<Blob> {
    return Promise.resolve(this.blob);
  }

  getText(): Promise<string> {
    return this.blob.text();
  }

  getName(): string {
    return this.name;
  }

  getSize(): Promise<number> {
    return Promise.resolve(this.blob.size);
  }

  getType(): Promise<string> {
    return Promise.resolve(this.blob.type);
  }
}

export class InMemoryFileSystem implements IFileSystem {
  private readonly store = new Map<string, { blob: Blob; name: string }>();
  private readonly pins = new Map<string, number>();
  private idCounter = 0;

  async pin(id: string): Promise<void> {
    const count = this.pins.get(id) ?? 0;
    this.pins.set(id, count + 1);
  }

  async unpin(id: string): Promise<void> {
    const count = this.pins.get(id) ?? 0;
    if (count <= 1) {
      this.pins.delete(id);
    } else {
      this.pins.set(id, count - 1);
    }
  }

  seed(id: string, blob: Blob): void {
    this.store.set(id, {
      blob,
      name: blob instanceof File && blob.name ? blob.name : id,
    });
  }

  async write(data: Blob): Promise<IFileEntry> {
    this.idCounter += 1;
    const id = `out-${this.idCounter}`;
    const name = data instanceof File && data.name ? data.name : id;
    this.store.set(id, { blob: data, name });
    return new MemoryFileEntry(id, data, name);
  }

  async read(id: string): Promise<IFileEntry> {
    const record = this.store.get(id);
    if (!record) {
      throw new Error(`Missing file: ${id}`);
    }
    return new MemoryFileEntry(id, record.blob, record.name);
  }

  async delete(id: string): Promise<void> {
    if ((this.pins.get(id) ?? 0) > 0) {
      const { FilePinnedError } = await import('../../core/types/contracts');
      throw new FilePinnedError(id);
    }
    this.store.delete(id);
  }
}
