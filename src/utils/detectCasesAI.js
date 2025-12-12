import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

let model = null;

// Charger le modèle une seule fois
export const loadModel = async () => {
  if (!model) {
    model = await cocoSsd.load();
    console.log("✅ Modèle IA chargé");
  }
};

// Détecter les cases sur une image
export const detectCasesAI = async (imgElement) => {
  if (!model) await loadModel();

  const predictions = await model.detect(imgElement);

  // Filtrer uniquement les "cases" si tu as une classe adaptée
  // Pour l'exemple on prend tout (tu pourras filtrer par classe)
  const cases = predictions.map(p => ({
    x: p.bbox[0],
    y: p.bbox[1],
    width: p.bbox[2],
    height: p.bbox[3],
  }));

  console.log("📦 Cases détectées :", cases.length);
  return cases;
};
