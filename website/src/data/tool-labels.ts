/**
 * Localised labels for the tool catalogue on /ja and /zh.
 *
 * `src/pages/ja.astro` and `src/pages/zh.astro` render the same catalogue as the English home
 * page, but a "localised" landing page that shows its tool grid in English reads as unfinished
 * (and, in a privacy niche, as untrustworthy). Category names and tool titles are translated
 * here; the tool *descriptions* are not rendered on those pages at all.
 *
 * Keys are `category.icon` and `tool.id` from `src/data/tools.ts` — add an entry when a tool is
 * added, otherwise the English label silently reappears.
 */

type ToolLabelMap = {
  categories: Record<string, string>;
  tools: Record<string, string>;
};

export const JA_TOOL_LABELS: ToolLabelMap = {
  categories: {
    catEdit: '編集とデザイン',
    catOrganize: '整理と最適化',
    catData: 'データと変換',
    catSecurity: 'セキュリティ',
  },
  tools: {
    'edit-text-pdf': 'スマート編集',
    'add-text-pdf': 'テキスト追加',
    'sign-pdf': '電子署名',
    'add-form-fields-pdf': 'フォーム項目',
    'watermark-pdf': 'ウォーターマーク',
    'flatten-pdf': 'PDFのフラット化',
    'merge-pdf': 'PDF結合',
    'split-pdf': 'PDF分割',
    'compress-pdf': 'PDF圧縮',
    'auto-toc-pdf': '目次の自動生成',
    'organize-pdf': 'ページ整理',
    'rotate-pdf': 'ページ回転',
    'delete-pages-pdf': 'ページ削除',
    'extract-pages-pdf': 'ページ抽出',
    'tables-pdf': '表のPDF化',
    'ocr-pdf': 'OCR（文字認識）',
    'pdf-to-word': 'PDF → Word',
    'word-to-pdf': 'Word → PDF',
    'images-to-pdf': '画像 → PDF',
    'pdf-to-images': 'PDF → 画像',
    'extract-images-pdf': '画像の抽出',
    'protect-pdf': 'PDFの保護',
  },
};

export const ZH_TOOL_LABELS: ToolLabelMap = {
  categories: {
    catEdit: '编辑与设计',
    catOrganize: '整理与优化',
    catData: '数据与转换',
    catSecurity: '安全',
  },
  tools: {
    'edit-text-pdf': '智能编辑',
    'add-text-pdf': '添加文字',
    'sign-pdf': '电子签名',
    'add-form-fields-pdf': '表单字段',
    'watermark-pdf': '水印',
    'flatten-pdf': '扁平化PDF',
    'merge-pdf': '合并PDF',
    'split-pdf': '拆分PDF',
    'compress-pdf': '压缩PDF',
    'auto-toc-pdf': '自动目录',
    'organize-pdf': '整理页面',
    'rotate-pdf': '旋转页面',
    'delete-pages-pdf': '删除页面',
    'extract-pages-pdf': '提取页面',
    'tables-pdf': '表格转PDF',
    'ocr-pdf': 'OCR 文字识别',
    'pdf-to-word': 'PDF 转 Word',
    'word-to-pdf': 'Word 转 PDF',
    'images-to-pdf': '图片转 PDF',
    'pdf-to-images': 'PDF 转图片',
    'extract-images-pdf': '提取图片',
    'protect-pdf': '加密PDF',
  },
};
