import * as pdfjsLib from "pdfjs-dist/webpack";

export const getPdfFirstPageImage = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);

    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const context = canvas.getContext("2d");
    await page.render({ canvasContext: context, viewport }).promise;

    return canvas.toDataURL();
};
