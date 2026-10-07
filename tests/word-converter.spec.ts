import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

const bridgeUrl = "http://127.0.0.1:43127";

async function createPdf(label: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  page.drawText(label, { x: 70, y: 760, size: 18 });
  return Buffer.from(await pdf.save());
}

test("usa o conversor local do Microsoft Word e baixa PDFs separados", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => Reflect.deleteProperty(window, "showDirectoryPicker"));
  await page.route(`${bridgeUrl}/health`, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ready: true, engine: "Microsoft Word", version: "16.0" }),
  }));

  const receivedNames: string[] = [];
  await page.route(`${bridgeUrl}/convert`, async (route) => {
    const encodedName = route.request().headers()["x-concrezip-filename"] ?? "";
    const fileName = decodeURIComponent(encodedName);
    receivedNames.push(fileName);
    expect(route.request().postDataBuffer()?.byteLength).toBeGreaterThan(0);
    await route.fulfill({ status: 200, contentType: "application/pdf", body: await createPdf(fileName) });
  });

  await page.goto("http://127.0.0.1:4173");
  await page.getByRole("button", { name: "Word para PDF" }).click();
  await expect(page.locator("#word-bridge-title")).toHaveText("Conversor local conectado");

  await page.locator("#word-file-input").setInputFiles([
    { name: "Laudo A.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from("docx-a") },
    { name: "Laudo B.doc", mimeType: "application/msword", buffer: Buffer.from("doc-b") },
  ]);
  await expect(page.locator(".word-file-row")).toHaveCount(2);

  const downloads: Array<{ name: string; path: string }> = [];
  page.on("download", async (download) => {
    const path = await download.path();
    if (path) downloads.push({ name: download.suggestedFilename(), path });
  });
  await page.getByRole("button", { name: "Converter e baixar PDFs" }).click();
  await expect(page.locator("#word-result")).toBeVisible();
  await expect(page.locator("#word-result-title")).toContainText("2 PDF(s) criado(s) pelo Word");
  await expect.poll(() => downloads.length).toBe(2);

  expect(receivedNames).toEqual(["Laudo A.docx", "Laudo B.doc"]);
  expect(downloads.map((download) => download.name).sort()).toEqual(["Laudo A.pdf", "Laudo B.pdf"]);
  for (const download of downloads) {
    const pdf = await PDFDocument.load(await readFile(download.path));
    expect(pdf.getPageCount()).toBe(1);
  }
});

test("bloqueia a conversão aproximada quando o auxiliar local não está aberto", async ({ page }) => {
  await page.addInitScript(() => Reflect.deleteProperty(window, "showDirectoryPicker"));
  await page.route(`${bridgeUrl}/health`, (route) => route.abort("connectionrefused"));
  await page.goto("http://127.0.0.1:4173");
  await page.getByRole("button", { name: "Word para PDF" }).click();
  await expect(page.locator("#word-bridge-title")).toHaveText("Conversor local não encontrado");
  await expect(page.getByRole("link", { name: "Baixar conversor local" })).toBeVisible();

  await page.locator("#word-file-input").setInputFiles({
    name: "Laudo.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from("docx"),
  });
  await expect(page.locator("#start-word-conversion")).toBeDisabled();
});
