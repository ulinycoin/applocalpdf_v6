#!/usr/bin/env node

const { Command } = require('commander');
const { readFileSync, writeFileSync } = require('fs');
const { resolve } = require('path');
const { saveConfig, loadConfig, apiRequest, validateApiKey } = require('./lib/api-client');

const program = new Command();

program
  .name('localpdf')
  .description('Process PDFs via LocalPDF API')
  .version('1.0.0');

const authCommand = program
  .command('auth')
  .description('Manage authentication');

authCommand
  .command('login')
  .description('Login with your API key')
  .argument('[key]', 'API key (or set LOCALPDF_API_KEY env)')
  .action(async (key?: string) => {
    const apiKey = key || process.env.LOCALPDF_API_KEY;
    if (!apiKey) {
      console.error('Error: Provide API key as argument or set LOCALPDF_API_KEY environment variable');
      process.exit(1);
    }

    console.log('Validating API key...');
    const valid = await validateApiKey(apiKey);
    if (!valid) {
      console.error('Error: Invalid API key');
      process.exit(1);
    }

    saveConfig({ apiKey });
    console.log('✓ Successfully authenticated');
  });

authCommand
  .command('status')
  .description('Show current authentication status')
  .action(() => {
    const config = loadConfig();
    if (!config.apiKey) {
      console.log('Not authenticated');
      return;
    }
    console.log(`Authenticated with key: ${config.apiKey.slice(0, 12)}...`);
  });

authCommand
  .command('logout')
  .description('Remove stored credentials')
  .action(() => {
    saveConfig({});
    console.log('✓ Logged out');
  });

const compressCommand = program
  .command('compress')
  .description('Compress PDF file')
  .argument('<input>', 'Input PDF file')
  .option('-o, --output <file>', 'Output file path')
  .option('-q, --quality <level>', 'Quality: low, medium, high', 'medium')
  .action(async (input: string, options: { output?: string; quality: string }) => {
    const inputPath = resolve(input);
    const outputPath = options.output || input.replace('.pdf', '-compressed.pdf');

    console.log(`Compressing ${input}...`);

    const fileBuffer = readFileSync(inputPath);
    const fileBase64 = fileBuffer.toString('base64');

    const result = await apiRequest('/process', {
      method: 'POST',
      body: JSON.stringify({
        file: fileBase64,
        tool: 'compress',
        options: { quality: options.quality },
      }),
    });

    writeFileSync(resolve(outputPath), Buffer.from(result.file, 'base64'));

    const inputSize = result.stats.inputSize;
    const outputSize = result.stats.outputSize;
    const ratio = ((1 - outputSize / inputSize) * 100).toFixed(1);

    console.log(`✓ Compressed: ${formatSize(inputSize)} → ${formatSize(outputSize)} (${ratio}% smaller)`);
    console.log(`  Saved to: ${outputPath}`);
  });

const ocrCommand = program
  .command('ocr')
  .description('OCR PDF - extract text from scanned documents')
  .argument('<input>', 'Input PDF file')
  .option('-o, --output <file>', 'Output file path')
  .option('-l, --languages <langs>', 'Languages (comma-separated)', 'eng')
  .action(async (input: string, options: { output?: string; languages: string }) => {
    const inputPath = resolve(input);
    const outputPath = options.output || input.replace('.pdf', '-ocr.pdf');

    console.log(`Running OCR on ${input}...`);

    const fileBuffer = readFileSync(inputPath);
    const fileBase64 = fileBuffer.toString('base64');

    const result = await apiRequest('/process', {
      method: 'POST',
      body: JSON.stringify({
        file: fileBase64,
        tool: 'ocr',
        options: {
          languages: options.languages.split(',').map(l => l.trim()),
        },
      }),
    });

    writeFileSync(resolve(outputPath), Buffer.from(result.file, 'base64'));

    console.log(`✓ OCR completed in ${(result.stats.processingTimeMs / 1000).toFixed(1)}s`);
    console.log(`  Saved to: ${outputPath}`);
  });

const signCommand = program
  .command('sign')
  .description('Sign PDF with a signature image')
  .argument('<input>', 'Input PDF file')
  .argument('<signature>', 'Signature image file (PNG)')
  .option('-o, --output <file>', 'Output file path')
  .option('-x, --x <number>', 'X position', '100')
  .option('-y, --y <number>', 'Y position', '100')
  .option('-p, --page <number>', 'Page number (0-indexed)', '0')
  .action(async (input: string, signature: string, options: { output?: string; x: string; y: string; page: string }) => {
    const inputPath = resolve(input);
    const signaturePath = resolve(signature);
    const outputPath = options.output || input.replace('.pdf', '-signed.pdf');

    console.log(`Signing ${input}...`);

    const fileBuffer = readFileSync(inputPath);
    const fileBase64 = fileBuffer.toString('base64');

    const signatureBuffer = readFileSync(signaturePath);
    const signatureBase64 = signatureBuffer.toString('base64');

    const result = await apiRequest('/process', {
      method: 'POST',
      body: JSON.stringify({
        file: fileBase64,
        tool: 'sign',
        options: {
          signatureImage: signatureBase64,
          signaturePosition: {
            x: Number(options.x),
            y: Number(options.y),
            page: Number(options.page),
          },
        },
      }),
    });

    writeFileSync(resolve(outputPath), Buffer.from(result.file, 'base64'));

    console.log(`✓ Signed in ${(result.stats.processingTimeMs / 1000).toFixed(1)}s`);
    console.log(`  Saved to: ${outputPath}`);
  });

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

program.parse();
