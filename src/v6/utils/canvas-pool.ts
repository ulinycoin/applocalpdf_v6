interface PooledCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
}

interface PoolEntry {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  inUse: boolean;
  width: number;
  height: number;
}

const MAX_POOL_SIZE = 16;
const pool: PoolEntry[] = [];

function createCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

export function acquireCanvas(width: number, height: number): PooledCanvas {
  for (const entry of pool) {
    if (!entry.inUse && entry.width >= width && entry.height >= height) {
      entry.inUse = true;
      entry.canvas.width = width;
      entry.canvas.height = height;
      return { canvas: entry.canvas, ctx: entry.ctx, width, height };
    }
  }

  for (const entry of pool) {
    if (!entry.inUse) {
      entry.inUse = true;
      entry.width = width;
      entry.height = height;
      entry.canvas.width = width;
      entry.canvas.height = height;
      return { canvas: entry.canvas, ctx: entry.ctx, width, height };
    }
  }

  const { canvas, ctx } = createCanvas();
  canvas.width = width;
  canvas.height = height;
  pool.push({ canvas, ctx, inUse: true, width, height });

  if (pool.length > MAX_POOL_SIZE) {
    const oldest = pool.find((e) => !e.inUse);
    if (oldest) {
      pool.splice(pool.indexOf(oldest), 1);
    }
  }

  return { canvas, ctx, width, height };
}

export function releaseCanvas(canvas: HTMLCanvasElement): void {
  for (const entry of pool) {
    if (entry.canvas === canvas) {
      entry.inUse = false;
      entry.ctx.clearRect(0, 0, entry.width, entry.height);
      return;
    }
  }
}

export function getPoolStats(): { total: number; inUse: number } {
  return {
    total: pool.length,
    inUse: pool.filter((e) => e.inUse).length,
  };
}
