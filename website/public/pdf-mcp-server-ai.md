# localpdf-mcp — Local PDF MCP Server Reference

**Official page:** https://localpdf.online/pdf-mcp-server
**Package:** https://www.npmjs.com/package/localpdf-mcp (MIT)
**Source:** https://github.com/ulinycoin/localpdf-mcp

## What it is

`localpdf-mcp` is an open-source Model Context Protocol server that gives an AI agent
seven PDF tools running on the user's own machine. The MCP client starts it over stdio;
it is not a hosted service and has no remote endpoint. It requires Node 22 or newer.

The server makes no network requests and sends no telemetry. Tool results are metadata —
paths, page counts, byte sizes, sha256 digests, char counts — instead of document bytes or
text, so the document body does not enter the model context by default. Web fonts and OCR
language data are pinned files inside the package, not CDN fetches.

## Install

Claude Code and other CLI clients:

```sh
claude mcp add localpdf -- npx -y localpdf-mcp
```

JSON-config clients:

```json
{
  "mcpServers": {
    "localpdf": {
      "command": "npx",
      "args": ["-y", "localpdf-mcp"]
    }
  }
}
```

## Tools

| Tool | Does | Returns |
|------|------|---------|
| `pdf_inspect` | page count, size, encryption flag, producer | metadata only |
| `pdf_merge` | concatenates 2+ PDFs in order | output path, pages, sha256 |
| `pdf_split` | one file per requested page | file list with per-file sha256 |
| `pdf_compress` | structural resave with object streams | before/after bytes, real percentage |
| `pdf_extract_text` | text layer into a .txt file on disk | per-page char counts |
| `pdf_replace_text` | white patch plus replacement text drawn on top | matches, bbox, page |
| `pdf_ocr` | invisible text layer for scans, local traineddata | lines, chars, confidence |

Page numbers are 1-based. The input file is never overwritten; outputs must point at a
different path. Scratch files live in `~/.localpdf-mcp/tmp` with mode 0700 and are pruned
after an hour.

## Boundaries

- `pdf_replace_text` is an overlay: the original text layer survives, so copy-paste still
  returns the old string. It is not redaction.
- `pdf_compress` is a structural resave and does not recompress images, so image-heavy PDFs
  may barely shrink.
- Encrypted files are reported, not decrypted; unlocking stays in the browser Studio.
- The server keeps the engine and the files local. It cannot keep a cloud model local:
  whatever the agent reads itself goes to that model's provider.

## Relationship to the browser product

The MCP server is the agent-facing engine. The browser workspace at
https://localpdf.online/app is the same class of local processing with a canvas UI for
drag-and-drop page moves, text editing, OCR review and redaction with a verification
certificate. Both are free to run; the browser product charges for exports beyond three
downloads a day, the MCP server has no limits.
