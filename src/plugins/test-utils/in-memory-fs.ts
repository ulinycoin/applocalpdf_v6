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
  private readonly store = new Map<string, Blob>();
  private idCounter = 0;

  seed(id: string, blob: Blob): void {
    this.store.set(id, blob);
  }

  async write(data: Blob): Promise<IFileEntry> {
    this.idCounter += 1;
    const id = `out-${this.idCounter}`;
    this.store.set(id, data);
    return new MemoryFileEntry(id, data, id);
  }

  async read(id: string): Promise<IFileEntry> {
    const blob = this.store.get(id);
    if (!blob) {
      throw new Error(`Missing file: ${id}`);
    }
    return new MemoryFileEntry(id, blob, id);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
