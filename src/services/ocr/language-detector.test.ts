import assert from 'node:assert/strict';
import test from 'node:test';
import { detectDocumentLanguage, isWeakAutoProbe, pickScriptProbeWinner, scriptShare, selectAutoOcrLanguagePack } from './language-detector';

test('detectDocumentLanguage identifies English text', () => {
  const result = detectDocumentLanguage('This is a sample invoice and the payment is due for the customer.');
  assert.equal(result.primaryLanguage, 'eng');
  assert.equal(result.dominantScript, 'latin');
  assert.ok(result.confidence > 0);
});

test('detectDocumentLanguage identifies Cyrillic text', () => {
  const result = detectDocumentLanguage('Это тестовый документ и в нем есть данные для проверки текста.');
  assert.equal(result.primaryLanguage, 'rus');
  assert.equal(result.dominantScript, 'cyrillic');
});

test('selectAutoOcrLanguagePack returns combined pack for close candidates', () => {
  const detection = detectDocumentLanguage('і це документ і дані для перевірки та тексту');
  const pack = selectAutoOcrLanguagePack(detection);
  assert.match(pack, /ukr/);
});

test('detectDocumentLanguage identifies Japanese text', () => {
  const result = detectDocumentLanguage('これは日本語のテキストです。請求書の合計金額を確認してください。');
  assert.equal(result.primaryLanguage, 'jpn');
  assert.equal(result.dominantScript, 'japanese');
});

test('detectDocumentLanguage identifies Hindi text', () => {
  const result = detectDocumentLanguage('यह हिंदी दस्तावेज़ का नमूना है और इसमें भुगतान की जानकारी है।');
  assert.equal(result.primaryLanguage, 'hin');
  assert.equal(result.dominantScript, 'devanagari');
});

test('detectDocumentLanguage identifies Arabic text', () => {
  const result = detectDocumentLanguage('هذا نص عربي ومثال على الفاتورة التي يجب على العميل دفعها في الوقت المحدد.');
  assert.equal(result.primaryLanguage, 'ara');
  assert.equal(result.dominantScript, 'arabic');
});

test('the detector recognises the high-traffic scripts', () => {
  assert.equal(detectDocumentLanguage('これは日本語のテスト文書です。請求書の内容を確認してください。').primaryLanguage, 'jpn');
  assert.equal(detectDocumentLanguage('这是一个中文测试文档，请确认发票内容和金额。').primaryLanguage, 'chi_sim');
  assert.equal(detectDocumentLanguage('هذا مستند اختبار باللغة العربية من أجل التحقق من النص.').primaryLanguage, 'ara');
});

test('scriptShare counts only the characters of that script', () => {
  assert.ok(scriptShare('これはテストです', 'jpn') > 0.9);
  assert.equal(scriptShare('plain english text', 'jpn'), 0);
  assert.ok(scriptShare('هذا اختبار', 'ara') > 0.9);
});

test('a blind English reading of a Japanese page is treated as weak', () => {
  assert.equal(isWeakAutoProbe({ text: 'Invoice', confidence: 12 }), true);
  assert.equal(isWeakAutoProbe({ text: '', confidence: 90 }), true);
  assert.equal(isWeakAutoProbe({ text: 'This is a normal English invoice for the customer', confidence: 82 }), false);
});

test('script probes prefer the model whose own characters dominate', () => {
  const winner = pickScriptProbeWinner([
    { language: 'jpn', text: 'これは日本語の文書です。請求書の内容。', confidence: 70 },
    { language: 'chi_sim', text: 'これは 日本語', confidence: 60 },
    { language: 'ara', text: 'invoice 123', confidence: 90 },
  ]);
  assert.equal(winner, 'jpn');

  assert.equal(pickScriptProbeWinner([
    { language: 'jpn', text: 'invoice total 12.00', confidence: 88 },
    { language: 'chi_sim', text: 'customer name', confidence: 80 },
    { language: 'ara', text: 'paid in full', confidence: 75 },
  ]), null);
});
