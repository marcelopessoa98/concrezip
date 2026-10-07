import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

const sourcePath = process.env.WORD_TEST_FILE;
const expectedPages = Number(process.env.WORD_TEST_PAGES || 0);

test("converte um DOCX real pelo Microsoft Word local", async ({ page }) => {
  test.skip(!sourcePath || expectedPages <= 0, "Defina WORD_TEST_FILE e WORD_TEST_PAGES para executar a integração nativa.");
  test.setTimeout(180_000);
  await page.addInitScript(() => Reflect.deleteProperty(window, "showDirectoryPicker"));
  await page.goto("http://127.0.0.1:4173");
  await page.getByRole("button", { name: "Word para PDF" }).click();
  await expect(page.locator("#word-bridge-title")).toHaveText("Conversor local conectado");
  await page.locator("#word-file-input").setInputFiles(sourcePath as string);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Converter e baixar PDFs" }).click();
  const download = await downloadPromise;
  const downloadedPath = await download.path();
  expect(downloadedPath).not.toBeNull();
  const pdf = await PDFDocument.load(await readFile(downloadedPath as string));
  expect(pdf.getPageCount()).toBe(expectedPages);
  await expect(page.locator("#word-result-title")).toContainText("1 PDF(s) criado(s) pelo Word");
});
