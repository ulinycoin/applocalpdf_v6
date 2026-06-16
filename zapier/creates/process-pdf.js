const perform = async (z: any, bundle: any) => {
  const { file, tool, quality, languages, signature_image, signature_x, signature_y, signature_page } = bundle.inputData;

  // Zapier file fields are URLs - download them first and convert to base64
  const fileResponse = await z.request({
    url: file,
    method: 'GET',
    raw: true,
  });
  const fileBase64 = Buffer.from(fileResponse).toString('base64');

  const options: Record<string, any> = {};
  if (quality) options.quality = quality;
  if (languages) options.languages = languages.split(',').map((l: string) => l.trim());
  
  // Handle signature image (also a URL from Zapier)
  if (signature_image) {
    const sigResponse = await z.request({
      url: signature_image,
      method: 'GET',
      raw: true,
    });
    options.signatureImage = Buffer.from(sigResponse).toString('base64');
  }
  
  if (signature_x !== undefined && signature_y !== undefined) {
    options.signaturePosition = {
      x: Number(signature_x),
      y: Number(signature_y),
      page: signature_page ? Number(signature_page) : 0,
    };
  }

  const response = await z.request({
    url: 'https://localpdf.online/api/process',
    method: 'POST',
    headers: {
      'x-api-key': bundle.authData.api_key,
      'Content-Type': 'application/json',
    },
    body: {
      file: fileBase64,
      tool,
      options,
    },
  });

  return {
    id: `processed_${Date.now()}`,
    file: response.data.file,
    inputSize: response.data.stats.inputSize,
    outputSize: response.data.stats.outputSize,
    processingTimeMs: response.data.stats.processingTimeMs,
    tool,
  };
};

const ProcessPdf = {
  key: 'process_pdf',
  noun: 'PDF',
  display: {
    label: 'Process PDF',
    description: 'Compress, OCR, or sign a PDF file using LocalPDF.',
  },
  operation: {
    perform,
    inputFields: [
      {
        key: 'file',
        label: 'PDF File',
        type: 'file',
        required: true,
        helpText: 'The PDF file to process.',
      },
      {
        key: 'tool',
        label: 'Operation',
        type: 'string',
        required: true,
        choices: {
          compress: 'Compress PDF - Reduce file size',
          ocr: 'OCR PDF - Extract text from scans',
          sign: 'Sign PDF - Add signature',
        },
        helpText: 'The operation to perform on the PDF.',
      },
      {
        key: 'quality',
        label: 'Quality (Compress only)',
        type: 'string',
        required: false,
        choices: {
          low: 'Low - Smallest file size',
          medium: 'Medium - Balanced (default)',
          high: 'High - Best quality',
        },
        helpText: 'Compression quality level.',
        conditions: [{ key: 'tool', value: 'compress' }],
      },
      {
        key: 'languages',
        label: 'Languages (OCR only)',
        type: 'string',
        required: false,
        helpText: 'Comma-separated language codes (e.g., "eng,jpn,deu"). Default: eng.',
        conditions: [{ key: 'tool', value: 'ocr' }],
      },
      {
        key: 'signature_image',
        label: 'Signature Image (Sign only)',
        type: 'file',
        required: false,
        helpText: 'Base64-encoded PNG image of the signature.',
        conditions: [{ key: 'tool', value: 'sign' }],
      },
      {
        key: 'signature_x',
        label: 'Signature X Position (Sign only)',
        type: 'number',
        required: false,
        default: 100,
        helpText: 'X coordinate for signature placement.',
        conditions: [{ key: 'tool', value: 'sign' }],
      },
      {
        key: 'signature_y',
        label: 'Signature Y Position (Sign only)',
        type: 'number',
        required: false,
        default: 100,
        helpText: 'Y coordinate for signature placement.',
        conditions: [{ key: 'tool', value: 'sign' }],
      },
      {
        key: 'signature_page',
        label: 'Signature Page (Sign only)',
        type: 'number',
        required: false,
        default: 0,
        helpText: 'Page number to place signature (0-indexed).',
        conditions: [{ key: 'tool', value: 'sign' }],
      },
    ],
    outputFields: [
      { key: 'id', label: 'Processing ID' },
      { key: 'file', label: 'Processed File (base64)' },
      { key: 'inputSize', label: 'Input Size (bytes)' },
      { key: 'outputSize', label: 'Output Size (bytes)' },
      { key: 'processingTimeMs', label: 'Processing Time (ms)' },
      { key: 'tool', label: 'Tool Used' },
    ],
  },
};

module.exports = ProcessPdf;
