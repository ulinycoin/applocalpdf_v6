declare module '@jspawn/qpdf-wasm' {
  interface QpdfWasmModuleOptions {
    noInitialRun?: boolean;
    noExitRuntime?: boolean;
    locateFile?: (path: string) => string;
    wasmBinary?: Uint8Array;
  }

  interface QpdfWasmRuntime {
    FS: {
      writeFile(path: string, data: Uint8Array): void;
      readFile(path: string): Uint8Array;
      unlink(path: string): void;
    };
    callMain(args: string[]): number;
  }

  const createQpdf: (options?: QpdfWasmModuleOptions) => Promise<QpdfWasmRuntime>;
  export default createQpdf;
}

declare module '@jspawn/qpdf-wasm/qpdf.wasm?url' {
  const url: string;
  export default url;
}
