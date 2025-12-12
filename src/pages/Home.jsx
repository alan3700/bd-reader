import React from "react";
import "./Home.css";

export default function Home() {
    const importBD = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const dbRequest = indexedDB.open("bd-reader", 1);
        dbRequest.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("bds")) {
                db.createObjectStore("bds", { keyPath: "id", autoIncrement: true });
            }
        };

        dbRequest.onsuccess = (event) => {
            const db = event.target.result;
            const tx = db.transaction("bds", "readwrite");
            const store = tx.objectStore("bds");

            store.add({
                name: file.name,
                file,
                importedAt: new Date().toISOString(),
            });

            tx.oncomplete = () => console.log("BD ajoutée !");
            tx.onerror = () => console.error("Erreur ajout BD");
        };

        dbRequest.onerror = () => console.error("Erreur ouverture DB");
    };

    return (
        <div className="home-container">
            <h1 className="home-title">Bienvenue dans BD Reader</h1>
            <input
                type="file"
                accept=".cbz,.cbr,.pdf,.jpg,.png"
                onChange={importBD}
            />
        </div>
    );
}
