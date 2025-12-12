import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getPdfFirstPageImage } from "../utils/pdfPreview.js";
import "./Library.css";

export default function Library() {
    const [bds, setBds] = useState([]);
    const [previews, setPreviews] = useState({});
    const navigate = useNavigate();

    const openDB = () => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open("bd-reader", 1);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains("bds")) {
                    db.createObjectStore("bds", { keyPath: "id", autoIncrement: true });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject("Erreur DB");
        });
    };

    useEffect(() => {
        const load = async () => {
            const db = await openDB();
            const tx = db.transaction("bds", "readonly");
            const store = tx.objectStore("bds");
            const request = store.getAll();
            request.onsuccess = async () => {
                const result = request.result;
                setBds(result);

                // Générer les aperçus
                const previewObj = {};
                for (let bd of result) {
                    if (bd.file.type === "application/pdf") {
                        previewObj[bd.id] = await getPdfFirstPageImage(bd.file);
                    } else {
                        previewObj[bd.id] = URL.createObjectURL(bd.file);
                    }
                }
                setPreviews(previewObj);
            };
        };

        load();
    }, []);

    const readBD = (id) => {
        navigate(`/reader/${id}`);
    };

    return (
        <div className="library-container">
            <h1 className="library-title">Ma Librairie</h1>
            {bds.length === 0 && <p>Aucune BD importée</p>}
            <div className="bd-grid">
                {bds.map((bd) => (
                    <div className="bd-card" key={bd.id} onClick={() => readBD(bd.id)}>
                        {previews[bd.id] ? (
                            <img src={previews[bd.id]} alt={bd.name} className="bd-image" />
                        ) : (
                            <div className="bd-preview bd-placeholder">Aperçu...</div>
                        )}
                        <div className="bd-name">{ bd.name.replace(/\d/g, "").replace(/_/g, " ") }</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
