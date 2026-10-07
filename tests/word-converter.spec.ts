import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import { decode } from "jpeg-js";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";

async function createDocx(pageTexts: string[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`);
  const paragraphs = pageTexts.map((text, index) => `
    <w:p><w:r><w:t>${text}</w:t></w:r></w:p>
    ${index < pageTexts.length - 1 ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : ""}`).join("");
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>
    </w:document>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

function expectEveryPdfPageHasVisibleContent(pdf: PDFDocument, expectedPages: number): void {
  let pageImages = 0;
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    if (object.dict.get(PDFName.of("Subtype"))?.toString() !== "/Image") continue;
    if (object.dict.get(PDFName.of("Filter"))?.toString() !== "/DCTDecode") continue;

    const image = decode(object.getContents(), true);
    let visibleSamples = 0;
    for (let index = 0; index < image.data.length; index += 16) {
      if (image.data[index] < 220 || image.data[index + 1] < 220 || image.data[index + 2] < 220) {
        visibleSamples += 1;
      }
    }
    expect(visibleSamples, "a página rasterizada não pode estar em branco").toBeGreaterThan(20);
    pageImages += 1;
  }
  expect(pageImages, "cada página deve conter sua imagem renderizada").toBe(expectedPages);
}

test("converte vários DOCX em PDFs separados", async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, "showDirectoryPicker");
  });
  await page.goto("http://127.0.0.1:4173");
  await page.getByRole("button", { name: "Word para PDF" }).click();
  await expect(page.getByRole("heading", { name: /Vários arquivos Word/ })).toBeVisible();

  const first = await createDocx(Array.from({ length: 30 }, (_, index) => `Laudo A — página ${index + 1}`));
  const second = await createDocx(["Laudo B — página 1", "Laudo B — página 2"]);
  await page.locator("#word-file-input").setInputFiles([
    { name: "Laudo A.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: first },
    { name: "Laudo B.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: second },
  ]);
  await expect(page.locator(".word-file-row")).toHaveCount(2);

  const downloads: Array<{ name: string; path: string }> = [];
  page.on("download", async (download) => {
    const path = await download.path();
    if (path) downloads.push({ name: download.suggestedFilename(), path });
  });
  await page.getByRole("button", { name: "Converter e baixar PDFs" }).click();
  await expect(page.locator("#word-result")).toBeVisible({ timeout: 120_000 });
  await expect(page.locator("#word-result-title")).toContainText("2 PDF(s) criado(s)");
  await expect.poll(() => downloads.length).toBe(2);

  const pageCounts: Record<string, number> = {};
  for (const download of downloads) {
    const bytes = await readFile(download.path);
    expect(bytes.byteLength).toBeGreaterThan(10_000);
    const pdf = await PDFDocument.load(bytes);
    pageCounts[download.name] = pdf.getPageCount();
    expectEveryPdfPageHasVisibleContent(pdf, pdf.getPageCount());
  }
  expect(pageCounts).toEqual({ "Laudo A.pdf": 30, "Laudo B.pdf": 2 });
});
