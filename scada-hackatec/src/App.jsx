import React, { useState, useEffect, useRef } from 'react';
import { useMqtt } from './hooks/useMqtt';
import CameraStream from './components/CameraStream';
import { performMultimodalAudit, queryAssistantInteractive } from './services/aiAuditService';
import { exportAuditPdf } from './utils/generatePdfReport';
import { 
  Activity, Cpu, Droplets, Flame, Terminal, FileDown, 
  Power, UserCheck, ShieldAlert, Mic, MicOff, Clock, Calendar, 
  Sun, Moon, Sparkles, Send, Volume2
} from 'lucide-react';

export default function App() {
  const { isConnected, telemetry, logs, publishCommand, addLog } = useMqtt();
  
  // 1. Selector de Tema Obligatorio (Día / Noche)
  const [theme, setTheme] = useState(() => localStorage.getItem('scada_theme') || 'dark');

  // 2. Control de Casos Individuales
  const [activeCase, setActiveCase] = useState('husillo'); // 'husillo' | 'hidraulico' | 'gas'
  
  // 3. Control de Acceso y Operadores
  const [currentUser, setCurrentUser] = useState({ name: 'Ángel Martínez', role: 'SUPERVISOR' });
  
  // 4. Captura Fotográfica para Dictamen
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  
  // 5. Inteligencia Artificial y Dictamen
  const [aiReport, setAiReport] = useState(null);
  const [isAuditing, setIsAuditing] = useState(false);
  
  // 6. Reloj y Fecha en Vivo
  const [clock, setClock] = useState(new Date());

  // 7. Interacción con IA (Texto y Micrófono)
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([
    { sender: 'ia', text: 'Sistema SCADA iniciado. Háblame o escríbeme y te responderé con voz obligatoria.' }
  ]);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  // Sincronización con el atributo data-theme en <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('scada_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // Reloj en tiempo real
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // -------------------------------------------------------------
  // MOTOR DE VOZ OBLIGATORIO (SPEECH SYNTHESIS)
  // -------------------------------------------------------------
  const speakMandatoryVoice = (text, isUrgent = false) => {
    if (!('speechSynthesis' in window)) {
      console.warn('El navegador no soporta síntesis de voz.');
      return;
    }

    // Cancelar colas previas y reanudar si estaba pausado
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();

    const cleanText = text.replace(/[*_#`]/g, ''); // Limpiar markdown
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'es-MX';
    utterance.rate = isUrgent ? 1.15 : 1.05;
    utterance.pitch = isUrgent ? 1.2 : 1.0;

    // Buscar voz en español disponible
    const voices = window.speechSynthesis.getVoices();
    const esVoice = voices.find(v => v.lang.startsWith('es'));
    if (esVoice) utterance.voice = esVoice;

    window.speechSynthesis.speak(utterance);
  };

  // Enviar mensaje de chat (Texto o Voz)
  const handleSendMessage = async (textOverride) => {
    const message = textOverride || chatInput;
    if (!message.trim()) return;

    setChatMessages(prev => [...prev, { sender: 'user', text: message }]);
    setChatInput('');
    addLog(`Operador consultó: "${message}"`);

    try {
      const response = await queryAssistantInteractive(message, { 
        activeCase, 
        telemetry, 
        operator: currentUser 
      });
      setChatMessages(prev => [...prev, { sender: 'ia', text: response }]);
      addLog(`IA respondió: "${response}"`);
      
      // VOZ OBLIGATORIA
      speakMandatoryVoice(response, false);
    } catch (err) {
      const fallbackMsg = 'Hubo un error de conexión, pero el SCADA mantiene las lecturas en tiempo real.';
      setChatMessages(prev => [...prev, { sender: 'ia', text: fallbackMsg }]);
      speakMandatoryVoice(fallbackMsg, true);
    }
  };

  // Entrada por micrófono
  const handleVoiceListen = () => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('Tu navegador no soporta entrada de voz. Usa Chrome o Edge.');
      return;
    }

    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRec();
    recognition.lang = 'es-MX';
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      handleSendMessage(transcript);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // Control de actuadores
  const handleActuator = (actuator, action) => {
    if (currentUser.role !== 'SUPERVISOR') {
      alert('ACCESO DENEGADO: Se requiere autorización de SUPERVISOR.');
      speakMandatoryVoice('Acceso denegado. Se requiere rol de supervisor.', true);
      return;
    }
    publishCommand(actuator, action);
  };

  // Evaluación Multimodal con Gemini y Voz Obligatoria
  const handleTriggerAudit = async () => {
    if (!capturedPhoto) {
      alert('Toma un fotograma antes de evaluar con la IA.');
      speakMandatoryVoice('Por favor, captura un fotograma con la cámara antes de evaluar.', false);
      return;
    }

    setIsAuditing(true);
    addLog(`Evaluando imagen y telemetría de [${activeCase.toUpperCase()}] con Gemini...`);

    try {
      const result = await performMultimodalAudit(capturedPhoto, telemetry, activeCase);
      setAiReport(result);
      addLog(`Auditoría lista. Riesgo detectado: ${result.safetyLevel}`);

      // VOZ OBLIGATORIA DEL DICTAMEN DE IA
      const voiceText = result.spokenWarning || `Auditoría finalizada. Nivel de riesgo ${result.safetyLevel}. ${result.rootCause}`;
      speakMandatoryVoice(voiceText, result.safetyLevel === 'CRITICAL');

      // Actuaciones automáticas de seguridad
      if (result.autoActionSuggested === 'TRIGGER_RELAY') {
        publishCommand('RELAY_CUTOFF', 'TRIGGER');
        addLog('AUTOMATISMO DE SEGURIDAD: Paro de motor aplicado.');
      } else if (result.autoActionSuggested === 'OPEN_GATE') {
        publishCommand('SERVO_GATE', 'OPEN_90');
        addLog('AUTOMATISMO DE SEGURIDAD: Compuerta hidráulica abierta a 90°.');
      } else if (result.autoActionSuggested === 'ACTIVATE_EXHAUST') {
        publishCommand('EXHAUST', 'START');
        publishCommand('BUZZER', 'ACTIVATE');
        addLog('AUTOMATISMO DE SEGURIDAD: Extractor forzado y alarma activados.');
      }
    } catch (err) {
      addLog(`Error en auditoría IA: ${err.message}`);
      speakMandatoryVoice('Atención, se produjo un inconveniente en la respuesta del modelo.', true);
    } finally {
      setIsAuditing(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col p-4 md:p-6 max-w-[1650px] mx-auto">
      
      {/* ---------------- BARRA SUPERIOR SCADA ---------------- */}
      <header className="card mb-5">
        <div className="card-header-top flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Activity className="animate-pulse text-white" size={26} />
            <div className="text-left">
              <h1 className="text-sm md:text-base font-bold tracking-wider uppercase text-white">
                SISTEMA SCADA INDUSTRIAL // HACKATEC 2026
              </h1>
              <p className="text-[11px] opacity-90 font-mono text-cyan-100">
                TECNOLOGÍAS EMERGENTES: TELEMETRÍA, TELEPROCESOS Y ADQUISICIÓN
              </p>
            </div>
          </div>

          {/* Fecha y Hora en tiempo real */}
          <div className="flex items-center gap-4 bg-black/20 px-3 py-1.5 rounded-lg text-xs font-mono text-white">
            <div className="flex items-center gap-1.5">
              <Calendar size={14} />
              <span>{clock.toLocaleDateString('es-MX')}</span>
            </div>
            <div className="flex items-center gap-1.5 font-bold text-amber-200">
              <Clock size={14} />
              <span>{clock.toLocaleTimeString('es-MX')}</span>
            </div>
          </div>

          {/* Controles de Conexión, Rol y Botón Obligatorio Día/Noche */}
          <div className="flex items-center flex-wrap gap-3 text-xs font-mono">
            <span className={`px-2.5 py-1 rounded-full font-bold flex items-center gap-1.5 text-white ${
              isConnected ? 'bg-emerald-600' : 'bg-rose-600'
            }`}>
              <span className={`w-2 h-2 rounded-full bg-white ${isConnected ? 'animate-ping' : ''}`}></span>
              {isConnected ? 'WSS ACTIVO' : 'OFFLINE'}
            </span>

            {/* Selector de Rol */}
            <div className="bg-black/25 px-2.5 py-1 rounded-lg flex items-center gap-2 text-white">
              <UserCheck size={14} />
              <span>{currentUser.name} (<strong>{currentUser.role}</strong>)</span>
              <button
                onClick={() => setCurrentUser(p => ({
                  ...p,
                  role: p.role === 'SUPERVISOR' ? 'OPERADOR' : 'SUPERVISOR'
                }))}
                className="px-2 py-0.5 bg-amber-400 text-slate-900 font-bold rounded text-[10px] hover:bg-amber-300 transition"
              >
                Cambiar Rol
              </button>
            </div>

            {/* BOTÓN OBLIGATORIO DE MODO DÍA A MODO NOCHE */}
            <button
              onClick={toggleTheme}
              className="theme-toggle-btn"
              title="Cambiar entre modo claro y oscuro"
            >
              {theme === 'dark' ? (
                <>
                  <Sun size={15} className="text-amber-400" />
                  <span>Modo Día</span>
                </>
              ) : (
                <>
                  <Moon size={15} className="text-blue-600" />
                  <span>Modo Noche</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ---------------- PESTAÑAS INDIVIDUALES POR CASO ---------------- */}
      <div className="card mb-5 p-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCase('husillo')}
            className={`btn-neon ${activeCase === 'husillo' ? '!bg-[var(--accent-neon)] !text-white' : ''}`}
          >
            <Cpu size={15} /> CASO 1: HUSILLO (MOTOR)
          </button>
          <button
            onClick={() => setActiveCase('hidraulico')}
            className={`btn-neon ${activeCase === 'hidraulico' ? '!bg-[var(--accent-neon)] !text-white' : ''}`}
          >
            <Droplets size={15} /> CASO 2: HIDRÁULICA (VERTEDERO)
          </button>
          <button
            onClick={() => setActiveCase('gas')}
            className={`btn-neon ${activeCase === 'gas' ? '!bg-[var(--accent-neon)] !text-white' : ''}`}
          >
            <Flame size={15} /> CASO 3: GAS MQ-2 & EXTRACTOR
          </button>
        </div>

        <span className="text-xs font-mono font-semibold" style={{ color: 'var(--accent-neon)' }}>
          MONITOREANDO: {activeCase.toUpperCase()}
        </span>
      </div>

      {/* ---------------- GRID PRINCIPAL ---------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        
        {/* PANEL IZQUIERDO: MEDICIONES INDIVIDUALES + HISTORIAL */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          
          <div className="card">
            <div className="card-header-top flex justify-between items-center">
              <h2 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <Activity size={15} /> ADQUISICIÓN Y CONTROL // {activeCase.toUpperCase()}
              </h2>
              <span className="text-[11px] font-mono opacity-80">Muestreo: 1.5s</span>
            </div>

            <div className="card-body-bottom space-y-4">
              
              {/* CASO 1: HUSILLO */}
              {activeCase === 'husillo' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-cyan-500/20 bg-black/5">
                      <p className="text-xs font-semibold opacity-75">VELOCIDAD ROTACIONAL</p>
                      <p className={`text-4xl font-bold font-mono my-2 ${telemetry.motorRpm < 500 ? 'text-rose-500' : 'text-emerald-500'}`}>
                        {telemetry.motorRpm} <span className="text-sm font-normal">RPM</span>
                      </p>
                      <p className="text-[11px] opacity-60">Umbral seguro &gt; 500 RPM</p>
                    </div>

                    <div className="p-4 rounded-xl border border-cyan-500/20 bg-black/5">
                      <p className="text-xs font-semibold opacity-75">TEMPERATURA DEVANADO</p>
                      <p className={`text-4xl font-bold font-mono my-2 ${telemetry.motorTemp > 50 ? 'text-rose-500' : 'text-blue-500'}`}>
                        {Number(telemetry.motorTemp).toFixed(1)} <span className="text-sm font-normal">°C</span>
                      </p>
                      <p className="text-[11px] opacity-60">Límite crítico: 60 °C</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-cyan-500/20 bg-black/5 flex flex-wrap items-center justify-between gap-3 text-left">
                    <div>
                      <p className="text-xs font-semibold opacity-75">RELEVADOR DE CORTE</p>
                      <p className={`text-sm font-bold font-mono ${telemetry.relayCutoff ? 'text-rose-500' : 'text-emerald-500'}`}>
                        {telemetry.relayCutoff ? 'ENCLAVADO (ALIMENTACIÓN CORTADA)' : 'ENERGIZADO NORMAL'}
                      </p>
                    </div>
                    <button
                      onClick={() => handleActuator('RELAY_CUTOFF', telemetry.relayCutoff ? 'RESTORE' : 'TRIGGER')}
                      className="btn-neon"
                    >
                      <Power size={14} /> {telemetry.relayCutoff ? 'Rearmar Motor' : 'Paro de Emergencia'}
                    </button>
                  </div>
                </>
              )}

              {/* CASO 2: HIDRÁULICO */}
              {activeCase === 'hidraulico' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-cyan-500/20 bg-black/5">
                      <p className="text-xs font-semibold opacity-75">NIVEL PRIMARIO (ULTRASÓNICO)</p>
                      <p className={`text-4xl font-bold font-mono my-2 ${telemetry.waterLevelMm > 70 ? 'text-amber-500' : 'text-cyan-500'}`}>
                        {telemetry.waterLevelMm} <span className="text-sm font-normal">mm</span>
                      </p>
                      <p className="text-[11px] opacity-60">Capacidad máx: 80 mm</p>
                    </div>

                    <div className="p-4 rounded-xl border border-cyan-500/20 bg-black/5">
                      <p className="text-xs font-semibold opacity-75">REDUNDANCIA SECUNDARIA</p>
                      <p className="text-4xl font-bold font-mono my-2 text-teal-500">
                        {telemetry.secondaryLevelMm} <span className="text-sm font-normal">mm</span>
                      </p>
                      <p className="text-[11px] opacity-60">Delta permitido: ±2.5 mm</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-cyan-500/20 bg-black/5 flex flex-wrap items-center justify-between gap-3 text-left">
                    <div>
                      <p className="text-xs font-semibold opacity-75">COMPUERTA DE ALIVIO (SERVO)</p>
                      <p className="text-sm font-bold font-mono">
                        ÁNGULO: {telemetry.gateServoAngle || 0}°
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleActuator('SERVO_GATE', 'OPEN_90')} className="btn-neon">
                        Abrir 90°
                      </button>
                      <button onClick={() => handleActuator('SERVO_GATE', 'CLOSE_0')} className="btn-neon">
                        Cerrar 0°
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* CASO 3: GAS */}
              {activeCase === 'gas' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-cyan-500/20 bg-black/5">
                      <p className="text-xs font-semibold opacity-75">CONCENTRACIÓN GAS MQ-2</p>
                      <p className={`text-4xl font-bold font-mono my-2 ${telemetry.mq2Ppm > 250 ? 'text-rose-500' : 'text-emerald-500'}`}>
                        {Number(telemetry.mq2Ppm).toFixed(0)} <span className="text-sm font-normal">PPM</span>
                      </p>
                      <p className="text-[11px] opacity-60">Límite crítico &gt; 250 PPM</p>
                    </div>

                    <div className="p-4 rounded-xl border border-cyan-500/20 bg-black/5">
                      <p className="text-xs font-semibold opacity-75">ALARMA SONORA (BUZZER)</p>
                      <p className={`text-xl font-bold font-mono my-2 ${telemetry.buzzerActive ? 'text-rose-500 animate-pulse' : 'opacity-60'}`}>
                        {telemetry.buzzerActive ? 'ACTIVADA (105 dB)' : 'EN ESPERA'}
                      </p>
                      <button
                        onClick={() => handleActuator('BUZZER', telemetry.buzzerActive ? 'SILENCE' : 'ACTIVATE')}
                        className="text-xs font-semibold underline"
                        style={{ color: 'var(--accent-neon)' }}
                      >
                        {telemetry.buzzerActive ? 'Silenciar Alarma' : 'Probar Tono'}
                      </button>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-cyan-500/20 bg-black/5 flex flex-wrap items-center justify-between gap-3 text-left">
                    <div>
                      <p className="text-xs font-semibold opacity-75">TURBINA EXTRACTORA DE GAS</p>
                      <p className="text-sm font-bold font-mono">
                        {telemetry.exhaustActive ? 'ACTIVA AL 100%' : 'APAGADA'}
                      </p>
                    </div>
                    <button
                      onClick={() => handleActuator('EXHAUST', telemetry.exhaustActive ? 'STOP' : 'START')}
                      className="btn-neon"
                    >
                      {telemetry.exhaustActive ? 'Detener Purga' : 'Purga Forzada'}
                    </button>
                  </div>
                </>
              )}

            </div>
          </div>

          {/* HISTORIAL MQTT */}
          <div className="card flex-1 flex flex-col text-left">
            <div className="card-header-top flex items-center gap-2">
              <Terminal size={15} />
              <span className="text-xs font-mono font-bold">BITÁCORA DE TELEPROCESOS MQTT</span>
            </div>
            <div className="card-body-bottom flex-1">
              <div className="h-36 overflow-y-auto font-mono text-[11px] flex flex-col gap-1 p-2 rounded bg-black/5">
                {logs.map((log) => (
                  <div key={log.id} className="flex gap-2">
                    <span className="opacity-50">[{log.time}]</span>
                    <span style={{ color: 'var(--accent-neon)' }}>&gt;&gt;</span>
                    <span>{log.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>

        {/* PANEL DERECHO: CÁMARA, AUDITORÍA GEMINI Y ASISTENTE POR VOZ */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          
          {/* Cámara Web */}
          <CameraStream 
            onPhotoCaptured={(photo) => setCapturedPhoto(photo)}
            currentPhoto={capturedPhoto}
            operatorsCount={aiReport?.operatorsDetectedCount || 1}
          />

          {/* Tarjeta de Auditoría de IA */}
          <div className="card text-left">
            <div className="card-header-top flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <ShieldAlert size={15} /> AUDITORÍA CON IA MULTIMODAL
              </span>
              <button
                onClick={handleTriggerAudit}
                disabled={isAuditing}
                className="px-3 py-1 bg-white text-slate-900 rounded font-bold text-xs hover:bg-slate-100 disabled:opacity-50 transition flex items-center gap-1.5"
              >
                <Sparkles size={13} className="text-blue-600" />
                {isAuditing ? 'Auditando...' : 'Evaluar con IA'}
              </button>
            </div>

            <div className="card-body-bottom space-y-3">
              {aiReport ? (
                <div className="p-3 rounded-lg border border-cyan-500/20 bg-black/5 text-xs font-mono space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="opacity-75">Nivel de Riesgo:</span>
                    <span className={`px-2 py-0.5 rounded font-bold text-white ${
                      aiReport.safetyLevel === 'CRITICAL' ? 'bg-rose-600' :
                      aiReport.safetyLevel === 'WARNING' ? 'bg-amber-600' : 'bg-emerald-600'
                    }`}>
                      {aiReport.safetyLevel}
                    </span>
                  </div>
                  <div><span className="opacity-75">Operadores:</span> {aiReport.operatorsDetectedCount} / 2</div>
                  <div><span className="opacity-75">Diagnóstico:</span> {aiReport.rootCause}</div>
                  <div><span className="opacity-75">Automatismo:</span> {aiReport.autoActionSuggested}</div>
                  <div><span className="opacity-75">Recomendación:</span> {aiReport.mitigationRecommendation}</div>
                </div>
              ) : (
                <p className="text-xs opacity-60 font-mono text-center py-2">
                  Captura un fotograma y haz clic en "Evaluar con IA" para oír el dictamen de voz.
                </p>
              )}

              {/* Botón Descargar PDF */}
              <button
                onClick={() => exportAuditPdf({
                  auditResult: aiReport,
                  telemetrySnapshot: telemetry,
                  operator: currentUser,
                  activeCase,
                  capturedFrame: capturedPhoto
                })}
                className="btn-neon w-full"
              >
                <FileDown size={15} /> GENERAR DICTAMEN DE AUDITORÍA (PDF)
              </button>
            </div>
          </div>

          {/* CHAT INTERACTIVO CON VOZ OBLIGATORIA */}
          <div className="card text-left">
            <div className="card-header-top flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Volume2 size={15} /> ASISTENTE SCADA (VOZ OBLIGATORIA)
              </span>
              <span className="text-[10px] opacity-80 font-mono">TTS Activo</span>
            </div>

            <div className="card-body-bottom space-y-3">
              <div className="h-32 overflow-y-auto flex flex-col gap-2 text-xs p-2 rounded bg-black/5">
                {chatMessages.map((msg, i) => (
                  <div 
                    key={i} 
                    className={`p-2 rounded-lg max-w-[85%] ${
                      msg.sender === 'user' 
                        ? 'bg-blue-500/20 text-right self-end border border-blue-500/30' 
                        : 'bg-black/10 text-left self-start border border-cyan-500/20'
                    }`}
                  >
                    <p className="text-[9px] opacity-60 font-bold mb-0.5">
                      {msg.sender === 'user' ? 'OPERADOR' : 'IA SCADA'}
                    </p>
                    <p>{msg.text}</p>
                  </div>
                ))}
              </div>

              {/* Input con Micrófono y Envío */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Haz una pregunta técnica a la IA..."
                  className="flex-1 p-2 text-xs rounded-lg border border-cyan-500/30 bg-black/5 outline-none focus:border-cyan-400"
                />
                <button
                  onClick={handleVoiceListen}
                  className={`p-2 rounded-lg border transition ${
                    isListening ? 'bg-rose-600 text-white animate-pulse' : 'border-cyan-500/40 text-cyan-600 hover:bg-cyan-500/10'
                  }`}
                  title="Hablar por micrófono"
                >
                  {isListening ? <MicOff size={15} /> : <Mic size={15} />}
                </button>
                <button
                  onClick={() => handleSendMessage()}
                  className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition"
                  title="Enviar"
                >
                  <Send size={15} />
                </button>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}