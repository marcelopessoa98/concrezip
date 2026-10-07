import { expect, test } from "@playwright/test";
import JSZip from "jszip";

async function createDocx(text: string): Promise<Buffer> {
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
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>
    </w:document>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

test("converte vários DOCX em PDFs separados", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, "showDirectoryPicker");
  });
  await page.goto("http://127.0.0.1:4173");
  await page.getByRole("button", { name: "Word para PDF" }).click();
  await expect(page.getByRole("heading", { name: /Vários arquivos Word/ })).toBeVisible();

  const first = await createDocx("Primeiro documento de teste");
  const second = await createDocx("Segundo documento de teste");
  await page.locator("#word-file-input").setInputFiles([
    { name: "Laudo A.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: first },
    { name: "Laudo B.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: second },
  ]);
  await expect(page.locator(".word-file-row")).toHaveCount(2);

  const downloads: string[] = [];
  page.on("download", (download) => downloads.push(download.suggestedFilename()));
  await page.getByRole("button", { name: "Converter e baixar PDFs" }).click();
  await expect(page.locator("#word-result")).toBeVisible({ timeout: 120_000 });
  await expect(page.locator("#word-result-title")).toContainText("2 PDF(s) criado(s)");
  expect(downloads.sort()).toEqual(["Laudo A.pdf", "Laudo B.pdf"]);
});
