export const openDB = () => {
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