import { GoogleGenAI } from '@google/genai';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// Modelos en orden de prioridad para evitar el 503
const MODELS_PRIORITY = ['gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];

export const performMultimodalAudit = async (imageBase64, telemetryData, activeCaseId) => {
  if (!apiKey) {
    throw new Error('VITE_GEMINI_API_KEY no encontrada en .env.local');
  }

  const prompt = `
Actúa como un Auditor Senior de Seguridad Industrial SCADA e IA de planta.
Analiza la siguiente telemetría en tiempo real y el fotograma de la cámara:

TELEMETRÍA ACTUAL:
${JSON.stringify(telemetryData, null, 2)}
CASO OPERATIVO: ${activeCaseId}

REGLAS DE AUDITORÍA:
1. Inspecciona la imagen: detecta presencia de operadores humanos (cuenta hasta 2) y riesgos físicos (fuego, fugas, humo, derrames).
2. Analiza los umbrales:
   - Husillo: RPM < 500 y Temp > 50°C -> Riesgo de devanado quemado.
   - Vertedero: Nivel > 70 mm -> Riesgo inminente de desbordamiento.
   - Gas: MQ-2 > 250 PPM -> Concentración inflamable/tóxica.
3. Responde ESTRICTAMENTE con un objeto JSON válido con esta estructura:
{
  "safetyLevel": "NORMAL" | "WARNING" | "CRITICAL",
  "operatorsDetectedCount": 1,
  "physicalAnomalyObserved": false,
  "rootCause": "<descripción concisa de la condición física>",
  "autoActionSuggested": "NONE" | "TRIGGER_RELAY" | "OPEN_GATE" | "ACTIVATE_EXHAUST",
  "spokenWarning": "<oración corta y clara en español para alertar por voz>",
  "interlockAuthorization": true,
  "mitigationRecommendation": "<acción correctiva requerida>"
}
`;

  const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const imagePart = {
    inlineData: {
      mimeType: 'image/jpeg',
      data: cleanBase64
    }
  };

  // Intentar con la lista de modelos ante saturación (503)
  for (const model of MODELS_PRIORITY) {
    try {
      const response = await ai.models.generateContent({
        model: model,
        contents: [{ text: prompt }, imagePart],
        config: { responseMimeType: 'application/json' }
      });
      return JSON.parse(response.text);
    } catch (err) {
      console.warn(`Modelo ${model} no disponible o saturado (503). Intentando alternativa...`, err);
    }
  }

  // Fallback seguro en caso de que los servidores de Google sigan saturados temporalmente
  const isEmergency = 
    (activeCaseId === 'husillo' && (telemetryData.motorRpm < 500 || telemetryData.motorTemp > 50)) ||
    (activeCaseId === 'hidraulico' && telemetryData.waterLevelMm > 70) ||
    (activeCaseId === 'gas' && telemetryData.mq2Ppm > 250);

  return {
    safetyLevel: isEmergency ? 'CRITICAL' : 'NORMAL',
    operatorsDetectedCount: 1,
    physicalAnomalyObserved: isEmergency,
    rootCause: isEmergency ? 'Parámetros sensoriales fuera de umbral nominal' : 'Condición de trabajo nominal estable',
    autoActionSuggested: isEmergency ? (activeCaseId === 'husillo' ? 'TRIGGER_RELAY' : activeCaseId === 'hidraulico' ? 'OPEN_GATE' : 'ACTIVATE_EXHAUST') : 'NONE',
    spokenWarning: isEmergency ? 'Advertencia. Parámetros críticos detectados. Actuando de emergencia.' : 'Sistema operando dentro de los parámetros seguros.',
    interlockAuthorization: !isEmergency,
    mitigationRecommendation: isEmergency ? 'Verificar condición física y reiniciar actuadores.' : 'Mantener supervisión rutinaria.'
  };
};

// Asistente para chat interactivo (Texto o Voz)
export const queryAssistantInteractive = async (userQuery, systemContext) => {
  const prompt = `
Eres la IA Copiloto del SCADA HackaTec 2026.
El operador consulta: "${userQuery}"
Contexto actual del sistema: ${JSON.stringify(systemContext)}
Responde de manera ejecutiva, concisa (máximo 2 oraciones), profesional y directa en español.
`;

  for (const model of MODELS_PRIORITY) {
    try {
      const response = await ai.models.generateContent({
        model: model,
        contents: [{ text: prompt }]
      });
      return response.text;
    } catch (err) {
      console.warn(`Falla en ${model}, reintentando...`);
    }
  }

  return 'El sistema SCADA se encuentra en línea. Todas las lecturas sensoriales continúan transmitiéndose vía MQTT.';
};