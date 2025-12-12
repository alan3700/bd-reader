import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { getDocument } from "pdfjs-dist/build/pdf";
import "./Reader.css";

export default function Reader() {
    const { id } = useParams();

    const [bd, setBd] = useState(null);
    const [pages, setPages] = useState([]);
    const [cases, setCases] = useState([]);
    const [currentPage, setCurrentPage] = useState(0);
    const [currentCase, setCurrentCase] = useState(0);

    const canvasRef = useRef(null);

    // =========================
    // DB
    // =========================
    const openDB = () =>
        new Promise((resolve, reject) => {
            const request = indexedDB.open("bd-reader", 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject("Erreur DB");
        });

    // =========================
    // 1️⃣ Chargement BD
    // =========================
    useEffect(() => {
        const loadBD = async () => {
            const db = await openDB();
            const tx = db.transaction("bds", "readonly");
            const store = tx.objectStore("bds");
            const request = store.get(Number(id));
            request.onsuccess = () => setBd(request.result);
        };
        loadBD();
    }, [id]);

    // =========================
    // 2️⃣ PDF → Images (20 pages max)
    // =========================
    useEffect(() => {
        const convertPDF = async () => {
            if (!bd || pages.length) return;

            if (bd.file.type.startsWith("image")) {
                setPages([URL.createObjectURL(bd.file)]);
                return;
            }

            const buffer = await bd.file.arrayBuffer();
            const pdf = await getDocument({ data: buffer, disableWorker: true }).promise;

            const maxPages = Math.min(20, pdf.numPages);
            const imgs = [];

            for (let i = 1; i <= maxPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 1.5 });

                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");

                canvas.width = viewport.width;
                canvas.height = viewport.height;

                await page.render({ canvasContext: ctx, viewport }).promise;
                imgs.push(canvas.toDataURL("image/png"));
            }

            setPages(imgs);
        };

        convertPDF();
    }, [bd]);

    // =========================
    // 3️⃣ DÉTECTION DES CASES (POLYGONES)
    // =========================
    useEffect(() => {
        if (!pages.length) return;

        const img = new Image();
        img.src = pages[currentPage];

        img.onload = () => {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");

            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            if (!window.cv) {
                console.log("❌ OpenCV pas chargé");
                return;
            }

            console.log("🖼️  Début détection des cases page", currentPage + 1);

            const src = window.cv.imread(canvas);

            // =========================
            // 1️⃣ NOIR & BLANC
            // =========================
            const gray = new window.cv.Mat();
            window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY);

            const blur = new window.cv.Mat();
            window.cv.GaussianBlur(gray, blur, new window.cv.Size(5, 5), 0);

            const thresh = new window.cv.Mat();
            window.cv.threshold(blur, thresh, 0, 255, window.cv.THRESH_BINARY_INV + window.cv.THRESH_OTSU);

            // =========================
            // 2️⃣ CONTOURS
            // =========================
            const contours = new window.cv.MatVector();
            const hierarchy = new window.cv.Mat();
            window.cv.findContours(
                thresh,
                contours,
                hierarchy,
                window.cv.RETR_EXTERNAL,
                window.cv.CHAIN_APPROX_NONE
            );

            const pageArea = img.width * img.height;
            let polygons = [];

            // =========================
            // 3️⃣ APPROX POLYGONE ORTHOGONAL
            // =========================
            const snapTo90 = (p1, p2) => {
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                if (Math.abs(dx) > Math.abs(dy)) {
                    return { x: p2.x, y: p1.y }; // horizontal
                } else {
                    return { x: p1.x, y: p2.y }; // vertical
                }
            };

            for (let i = 0; i < contours.size(); i++) {
                const c = contours.get(i);
                const area = window.cv.contourArea(c);

                // Skip tiny or huge cases (mais on gère >70% après)
                if (area < pageArea * 0.02) continue;

                const poly = [];
                for (let j = 0; j < c.rows; j++) {
                    const point = { x: c.intAt(j, 0), y: c.intAt(j, 1) };
                    if (poly.length === 0) {
                        poly.push(point);
                    } else {
                        const last = poly[poly.length - 1];
                        poly.push(snapTo90(last, point));
                    }
                }

                // fermer le polygone
                if (poly.length > 1) {
                    const last = poly[poly.length - 1];
                    const first = poly[0];
                    poly.push(snapTo90(last, first));
                }

                // =========================
                // 4️⃣ Si case > 70% → full page
                // =========================
                if (area > pageArea * 0.7) {
                    polygons = [[
                        { x: 0, y: 0 },
                        { x: img.width, y: 0 },
                        { x: img.width, y: img.height },
                        { x: 0, y: img.height }
                    ]];
                    break; // on arrête, plus besoin d'autres cases
                } else {
                    polygons.push(poly);
                }
            }

            // =========================
            // 2 premières pages → force full page
            // =========================
            if (currentPage < 2) {
                polygons = [[
                    { x: 0, y: 0 },
                    { x: img.width, y: 0 },
                    { x: img.width, y: img.height },
                    { x: 0, y: img.height }
                ]];
            }

            // =========================
            // TRI LECTURE
            // =========================
            polygons.sort((a, b) => {
                const aY = Math.min(...a.map(p => p.y));
                const bY = Math.min(...b.map(p => p.y));
                const sameRow = Math.abs(aY - bY) < img.height * 0.1;
                if (sameRow) {
                    const aX = Math.min(...a.map(p => p.x));
                    const bX = Math.min(...b.map(p => p.x));
                    return aX - bX;
                }
                return aY - bY;
            });

            if (polygons.length === 0) {
                polygons = [[
                    { x: 0, y: 0 },
                    { x: img.width, y: 0 },
                    { x: img.width, y: img.height },
                    { x: 0, y: img.height }
                ]];
            }

            console.log("🎯 POLYGONES FINAUX :", polygons.length);

            setCases(polygons);
            setCurrentCase(0);

            // =========================
            // Cleanup
            // =========================
            src.delete();
            gray.delete();
            blur.delete();
            thresh.delete();
            contours.delete();
            hierarchy.delete();
        };
    }, [currentPage, pages]);



    // ==========================
    // AFFICHAGE CASE ACTIVE
    // ==========================
    useEffect(() => {
        if (!pages.length || !cases.length) return;

        const img = new Image();
        img.src = pages[currentPage];

        img.onload = () => {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");

            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;

            const active = cases[currentCase];

            // Bounding box de la case active
            const minX = Math.min(...active.map(p => p.x));
            const maxX = Math.max(...active.map(p => p.x));
            const minY = Math.min(...active.map(p => p.y));
            const maxY = Math.max(...active.map(p => p.y));
            const caseWidth = maxX - minX;
            const caseHeight = maxY - minY;

            const padding = 50;
            const scaledWidth = caseWidth + padding * 2;
            const scaledHeight = caseHeight + padding * 2;

            // Canvas temporaire pour la case
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = scaledWidth;
            tempCanvas.height = scaledHeight;
            const tempCtx = tempCanvas.getContext("2d");

            // Fond blanc pour masquer le reste
            tempCtx.fillStyle = "white";
            tempCtx.fillRect(0, 0, scaledWidth, scaledHeight);

            // Dessiner la case active
            tempCtx.save();
            tempCtx.beginPath();
            active.forEach((p, i) => {
                if (i === 0) tempCtx.moveTo(p.x - minX + padding, p.y - minY + padding);
                else tempCtx.lineTo(p.x - minX + padding, p.y - minY + padding);
            });
            tempCtx.closePath();
            tempCtx.clip();
            tempCtx.drawImage(img, -minX + padding, -minY + padding);
            tempCtx.restore();

            // Contour blanc
            tempCtx.save();
            tempCtx.strokeStyle = "white";
            tempCtx.lineWidth = 5;
            tempCtx.shadowColor = "black";
            tempCtx.shadowBlur = 30;
            tempCtx.beginPath();
            active.forEach((p, i) => {
                if (i === 0) tempCtx.moveTo(p.x - minX + padding, p.y - minY + padding);
                else tempCtx.lineTo(p.x - minX + padding, p.y - minY + padding);
            });
            tempCtx.closePath();
            tempCtx.stroke();
            tempCtx.restore();

            // Ambilight : couleur dominante de la page
            const ambiCanvas = document.createElement("canvas");
            ambiCanvas.width = canvas.width;
            ambiCanvas.height = canvas.height;
            const ambiCtx = ambiCanvas.getContext("2d");

            // --- Calcul couleur dominante simple ---
            const smallCanvas = document.createElement("canvas");
            smallCanvas.width = 50;
            smallCanvas.height = 50;
            const smallCtx = smallCanvas.getContext("2d");
            smallCtx.drawImage(img, 0, 0, 50, 50);
            const data = smallCtx.getImageData(0, 0, 50, 50).data;
            let r = 0, g = 0, b = 0, count = 0;
            for (let i = 0; i < data.length; i += 4) {
                r += data[i];
                g += data[i + 1];
                b += data[i + 2];
                count++;
            }
            r = Math.round(r / count);
            g = Math.round(g / count);
            b = Math.round(b / count);
            const dominantColor = `rgba(${r},${g},${b},0.5)`;

            const ambiGradient = ambiCtx.createRadialGradient(
                canvas.width / 2,
                canvas.height / 2,
                Math.min(canvas.width, canvas.height) * 0.1,
                canvas.width / 2,
                canvas.height / 2,
                Math.min(canvas.width, canvas.height) * 0.9
            );
            ambiGradient.addColorStop(0, dominantColor);
            ambiGradient.addColorStop(1, "rgba(0,0,0,0)");
            ambiCtx.fillStyle = ambiGradient;
            ambiCtx.fillRect(0, 0, canvas.width, canvas.height);

            // --- Animation zoom et ambilight ---
            let scale = 0.1;
            const targetScale = Math.min(
                canvas.width / scaledWidth,
                canvas.height / scaledHeight
            ) * 0.8;

            let pulse = 0;
            let lastTime = null;

            function animate(time) {
                if (!lastTime) lastTime = time;
                const delta = (time - lastTime) / 1000; // secondes
                lastTime = time;

                // Zoom fluide
                const zoomSpeed = 2.5; // ajuster vitesse
                scale += (targetScale - scale) * zoomSpeed * delta;
                if (Math.abs(targetScale - scale) < 0.001) scale = targetScale;

                ctx.clearRect(0, 0, canvas.width, canvas.height);

                // Fond noir
                ctx.fillStyle = "black";
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Ambilight avec respiration
                pulse += 0.05;
                ctx.globalAlpha = 0.5 + Math.sin(pulse) * 0.3;
                ctx.drawImage(ambiCanvas, 0, 0);
                ctx.globalAlpha = 1;

                const dx = canvas.width / 2 - (scaledWidth * scale) / 2;
                const dy = canvas.height / 2 - (scaledHeight * scale) / 2;

                ctx.drawImage(
                    tempCanvas,
                    0, 0, scaledWidth, scaledHeight,
                    dx, dy, scaledWidth * scale, scaledHeight * scale
                );

                requestAnimationFrame(animate);
            }

            requestAnimationFrame(animate);
        };
    }, [currentCase, cases, currentPage, pages]);

    // =========================
    // 5️⃣ NAVIGATION
    // =========================
    // =========================
    // Préparer la page et ses cases
    // =========================
    const preparePage = async (pageIndex) => {
        if (!pages[pageIndex]) return;

        const imgNext = new Image();
        imgNext.src = pages[pageIndex];
        await new Promise((resolve) => (imgNext.onload = resolve));

        if (!window.cv) return [];

        const canvas = document.createElement("canvas");
        canvas.width = imgNext.width;
        canvas.height = imgNext.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(imgNext, 0, 0);

        const src = window.cv.imread(canvas);
        const gray = new window.cv.Mat();
        window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY);

        const blur = new window.cv.Mat();
        window.cv.GaussianBlur(gray, blur, new window.cv.Size(5, 5), 0);

        const thresh = new window.cv.Mat();
        window.cv.threshold(thresh, thresh, 0, 255, window.cv.THRESH_BINARY_INV + window.cv.THRESH_OTSU);

        const contours = new window.cv.MatVector();
        const hierarchy = new window.cv.Mat();
        window.cv.findContours(thresh, contours, hierarchy, window.cv.RETR_EXTERNAL, window.cv.CHAIN_APPROX_NONE);

        const pageArea = imgNext.width * imgNext.height;
        let polygons = [];
        const snapTo90 = (p1, p2) => Math.abs(p2.x - p1.x) > Math.abs(p2.y - p1.y)
            ? { x: p2.x, y: p1.y }
            : { x: p1.x, y: p2.y };

        for (let i = 0; i < contours.size(); i++) {
            const c = contours.get(i);
            const area = window.cv.contourArea(c);
            if (area < pageArea * 0.02 || area > pageArea * 0.9) continue;

            const poly = [];
            for (let j = 0; j < c.rows; j++) {
                const point = { x: c.intAt(j, 0), y: c.intAt(j, 1) };
                if (!poly.length) poly.push(point);
                else poly.push(snapTo90(poly[poly.length - 1], point));
            }
            if (poly.length > 1) poly.push(snapTo90(poly[poly.length - 1], poly[0]));
            polygons.push(poly);
        }

        if (!polygons.length) {
            polygons = [[
                { x: 0, y: 0 },
                { x: imgNext.width, y: 0 },
                { x: imgNext.width, y: imgNext.height },
                { x: 0, y: imgNext.height }
            ]];
        }

        polygons.sort((a, b) => {
            const aY = Math.min(...a.map(p => p.y));
            const bY = Math.min(...b.map(p => p.y));
            const sameRow = Math.abs(aY - bY) < imgNext.height * 0.1;
            if (sameRow) return Math.min(...a.map(p => p.x)) - Math.min(...b.map(p => p.x));
            return aY - bY;
        });

        // Cleanup OpenCV
        src.delete();
        gray.delete();
        blur.delete();
        thresh.delete();
        contours.delete();
        hierarchy.delete();

        return polygons;
    };

    // =========================
    // Navigation simplifiée
    // =========================
    const next = async () => {
        if (currentCase < cases.length - 1) {
            setCurrentCase(currentCase + 1);
        } else if (currentPage < pages.length - 1) {
            const nextPage = currentPage + 1;
            const nextCases = await preparePage(nextPage);
            setCases(nextCases);
            setCurrentPage(nextPage);
            setCurrentCase(0);
        }
    };

    const previous = async () => {
        if (currentCase > 0) {
            setCurrentCase(currentCase - 1);
        } else if (currentPage > 0) {
            const prevPage = currentPage - 1;
            const prevCases = await preparePage(prevPage);
            setCases(prevCases);
            setCurrentPage(prevPage);
            setCurrentCase(prevCases.length - 1);
        }
    };


    // =========================
    // 6️⃣ RENDER
    // =========================
    return (
        <div className="reader-container">
            {!pages.length ? (
                <p>Chargement BD...</p>
            ) : (
                
                <>
                        <canvas ref={canvasRef}></canvas>
                        <button onClick={previous} style={{
                            position: "fixed",
                            top: "50px",
                            left: "20px",
                            zIndex: 1000, // devant tout
                            padding: "10px 20px",
                            fontSize: "16px",
                            cursor: "pointer",
                        }}
                        >Previous
                        </button>
                        
                        <button
                            onClick={next}
                            style={{
                                position: "fixed",
                                top: "50px",
                                right: "20px",
                                zIndex: 1000, // devant tout
                                padding: "10px 20px",
                                fontSize: "16px",
                                cursor: "pointer",
                            }}
                        >
                            Next
                        </button>
                        <p style={{
                            position: "fixed",
                            color: "white",
                            top: "35px",
                            right: "500px",
                            zIndex: 1000, // devant tout
                            padding: "10px 20px",
                            fontSize: "16px",
                            cursor: "pointer",
                        }}>
                            Page {currentPage + 1}/{pages.length} — Case {currentCase + 1}/{cases.length}
                        </p>
                </>
            )}
        </div>
    );
}
