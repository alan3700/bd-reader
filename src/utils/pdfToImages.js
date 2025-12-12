import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";

export async function pdfToImages(pdfFile) {
  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const images = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 }); // ajuster le scale si besoin

    // Création d’un canvas temporaire
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Conversion en blob
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );

    images.push(blob);
  }

  return images; // Tableau de Blobs image
}
