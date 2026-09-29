import { useEffect, useRef, useState, useCallback } from 'react';
import mqtt from 'mqtt';

const BROKER_URL = 'wss://broker.hivemq.com:8884/mqtt';
const BASE_TOPIC = 'hackatec/2026/scada';

export const useMqtt = () => {
  const [client, setClient] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [telemetry, setTelemetry] = useState({
    // Caso 1: Husillo
    motorRpm: 1850,
    motorTemp: 32.5,
    relayCutoff: false,
    // Caso 2: Hidráulico
    waterLevelMm: 45.0,
    gateServoAngle: 0,
    secondaryLevelMm: 44.2,
    // Caso 3: Gas e Incendio
    mq2Ppm: 120,
    buzzerActive: false,
    exhaustActive: false,
    timestamp: new Date().toISOString()
  });
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const clientId = `scada_client_${Math.random().toString(16).substring(2, 8)}`;
    const mqttClient = mqtt.connect(BROKER_URL, {
      clientId,
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 2500,
    });

    mqttClient.on('connect', () => {
      setIsConnected(true);
      mqttClient.subscribe(`${BASE_TOPIC}/telemetry`, { qos: 0 });
      mqttClient.subscribe(`${BASE_TOPIC}/ack`, { qos: 1 });
      addLog(`Conectado a Broker WSS (${clientId})`);
    });

    mqttClient.on('message', (topic, payload) => {
      try {
        const data = JSON.parse(payload.toString());
        if (topic.endsWith('/telemetry')) {
          setTelemetry((prev) => ({ ...prev, ...data, timestamp: new Date().toISOString() }));
        } else if (topic.endsWith('/ack')) {
          addLog(`ACK Recibido de Hardware: ${JSON.stringify(data)}`);
        }
      } catch (err) {
        console.error('Error parseando MQTT JSON:', err);
      }
    });

    mqttClient.on('error', (err) => {
      console.error('Error MQTT:', err);
      setIsConnected(false);
    });

    mqttClient.on('close', () => setIsConnected(false));

    setClient(mqttClient);

    return () => {
      if (mqttClient) mqttClient.end(true);
    };
  }, []);

  const addLog = (text) => {
    setLogs((prev) => [
      { id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(), text },
      ...prev.slice(0, 49)
    ]);
  };

  const publishCommand = useCallback((actuator, action, params = {}) => {
    if (!client || !isConnected) {
      addLog('Error: Broker MQTT no conectado.');
      return false;
    }
    const payload = JSON.stringify({
      commandId: `cmd_${Date.now()}`,
      actuator,
      action,
      params,
      timestamp: Date.now()
    });
    client.publish(`${BASE_TOPIC}/commands`, payload, { qos: 1 });
    addLog(`Comando emitido: ${actuator} -> ${action}`);
    return true;
  }, [client, isConnected]);

  return { isConnected, telemetry, logs, publishCommand, addLog };
};